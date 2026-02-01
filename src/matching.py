import json
import time
import logging
from pydantic import BaseModel
import anthropic

logger = logging.getLogger(__name__)

from src.config import (
    ANTHROPIC_API_KEY,
    STAGE1_MODEL,
    STAGE2_MODEL,
    CLARITY_MODEL,
    DB_PATH,
    STAGE1_MIN_CANDIDATES,
    STAGE1_MAX_CANDIDATES,
    TOP_K_RESULTS,
)
from src.prompts import CLARITY_SYSTEM_PROMPT, STAGE1_SYSTEM_PROMPT, STAGE2_SYSTEM_PROMPT
from src.profiles import get_compressed_profiles, get_full_profiles
from src.db import get_company_context


# --- Pydantic schemas for structured output ---

class ClarityResult(BaseModel):
    is_clear: bool
    clarifying_question: str | None = None


class Stage1Result(BaseModel):
    selected_contact_ids: list[int]
    reasoning_summary: str


class MatchExplanation(BaseModel):
    contact_id: int
    name: str
    title: str
    company: str
    linkedin_url: str
    explanation: str
    conversation_hooks: str


class Stage2Result(BaseModel):
    matches: list[MatchExplanation]
    notes: str


def _get_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def _tool_use_call(client, model, system, messages, schema_class, tool_name, retries=1, **kwargs):
    """Make an API call using tool-use for structured output, with retry on failure."""
    tools = [{
        "name": tool_name,
        "description": f"Report the {tool_name} results",
        "input_schema": schema_class.model_json_schema(),
    }]
    last_err = None
    for attempt in range(1 + retries):
        try:
            start = time.time()
            message = client.messages.create(
                model=model,
                max_tokens=4096,
                system=system,
                messages=messages,
                tools=tools,
                tool_choice={"type": "tool", "name": tool_name},
                **kwargs,
            )
            elapsed = time.time() - start

            # Log usage
            usage = getattr(message, "usage", None)
            logger.info(
                "API call %s: model=%s elapsed=%.1fs stop=%s input=%s output=%s cache_read=%s cache_create=%s",
                tool_name, model, elapsed,
                message.stop_reason,
                getattr(usage, "input_tokens", "?"),
                getattr(usage, "output_tokens", "?"),
                getattr(usage, "cache_read_input_tokens", 0),
                getattr(usage, "cache_creation_input_tokens", 0),
            )

            for block in message.content:
                if block.type == "tool_use":
                    return schema_class.model_validate(block.input)
            raise ValueError(f"No tool_use block in response for {tool_name}")
        except (anthropic.APITimeoutError, anthropic.APIConnectionError, anthropic.RateLimitError) as e:
            last_err = e
            if attempt < retries:
                wait = 2 ** attempt
                logger.warning("Retrying %s after %s (attempt %d): %s", tool_name, wait, attempt + 1, e)
                time.sleep(wait)
            else:
                raise
    raise last_err  # unreachable but satisfies type checker


def _format_company_context(company: dict | None) -> str:
    if not company:
        return "Company context not available."
    parts = [f"Company: {company['name']}"]
    if company.get("one_liner"):
        parts.append(f"Description: {company['one_liner']}")
    if company.get("industry"):
        parts.append(f"Industry: {company['industry']}")
    if company.get("funding_stage"):
        parts.append(f"Stage: {company['funding_stage']}")
    if company.get("website"):
        parts.append(f"Website: {company['website']}")
    return "\n".join(parts)


def assess_ask_clarity(ask: str, company_context: str) -> dict:
    """Assess whether an ask is specific enough to produce quality matches."""
    client = _get_client()
    result = _tool_use_call(
        client,
        model=CLARITY_MODEL,
        system=[{"type": "text", "text": CLARITY_SYSTEM_PROMPT}],
        messages=[{
            "role": "user",
            "content": f"<company_context>\n{company_context}\n</company_context>\n\n<ask>\n{ask}\n</ask>",
        }],
        schema_class=ClarityResult,
        tool_name="report_clarity",
    )
    return result.model_dump()


def stage1_screen(ask: str, company_context: str, compressed_profiles: str) -> list[int]:
    """Screen ~800 compressed profiles, return 15-30 candidate contact_ids."""
    client = _get_client()
    system_prompt = STAGE1_SYSTEM_PROMPT.format(profiles=compressed_profiles)

    result = _tool_use_call(
        client,
        model=STAGE1_MODEL,
        system=[{
            "type": "text",
            "text": system_prompt,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{
            "role": "user",
            "content": f"<company_context>\n{company_context}\n</company_context>\n\n<ask>\n{ask}\n</ask>",
        }],
        schema_class=Stage1Result,
        tool_name="report_screening",
        extra_headers={"anthropic-beta": "prompt-caching-2024-07-31"},
    )
    return result.selected_contact_ids


def stage2_rank(ask: str, company_context: str, full_profiles: str) -> list[dict]:
    """Rank 15-30 candidates down to top 3 with explanations."""
    client = _get_client()
    system_prompt = STAGE2_SYSTEM_PROMPT.format(
        company_context=company_context,
        full_profiles=full_profiles,
    )

    result = _tool_use_call(
        client,
        model=STAGE2_MODEL,
        system=[{"type": "text", "text": system_prompt}],
        messages=[{
            "role": "user",
            "content": f"<ask>\n{ask}\n</ask>\n\nReturn the top {TOP_K_RESULTS} matches.",
        }],
        schema_class=Stage2Result,
        tool_name="report_ranking",
    )
    return [m.model_dump() for m in result.matches]


def run_matching_pipeline(ask: str, company_name: str, db_path: str = DB_PATH, slack_user_id: str | None = None) -> dict:
    """Full pipeline: clarity check -> stage1 -> stage2 -> formatted results."""
    import time as _time
    from src.query_log import log_query

    t0 = _time.time()
    timings = {}

    company = get_company_context(db_path, company_name)
    company_ctx = _format_company_context(company)
    logger.info("[STEP 0] Clarity check starting — company=%s ask=%r", company_name, ask[:80])

    # Step 0: Clarity check
    clarity = assess_ask_clarity(ask, company_ctx)
    timings["clarity"] = _time.time() - t0
    logger.info("[STEP 0] Clarity result: is_clear=%s (%.1fs elapsed)", clarity["is_clear"], timings["clarity"])
    if not clarity["is_clear"]:
        logger.info("[STEP 0] Returning clarifying question")
        log_query(
            slack_user_id=slack_user_id, company_name=company_name, ask_text=ask,
            result_type="clarification", clarifying_question=clarity["clarifying_question"],
            clarity_secs=timings["clarity"], total_secs=_time.time() - t0,
        )
        return {
            "type": "clarification",
            "clarifying_question": clarity["clarifying_question"],
            "matches": None,
            "notes": None,
        }

    # Step 1: Screen
    logger.info("[STEP 1] Building compressed profiles...")
    compressed = get_compressed_profiles(db_path, shuffle=True)
    logger.info("[STEP 1] Screening %d chars of profiles...", len(compressed))
    t1 = _time.time()
    candidate_ids = stage1_screen(ask, company_ctx, compressed)
    timings["stage1"] = _time.time() - t1
    logger.info("[STEP 1] Screened → %d candidates (%.1fs stage1, %.1fs elapsed)", len(candidate_ids), timings["stage1"], _time.time() - t0)

    # Step 2: Rank
    logger.info("[STEP 2] Building full profiles for %d candidates...", len(candidate_ids))
    full_profiles = get_full_profiles(db_path, candidate_ids)
    logger.info("[STEP 2] Ranking...")
    t2 = _time.time()
    matches = stage2_rank(ask, company_ctx, full_profiles)
    timings["stage2"] = _time.time() - t2
    total = _time.time() - t0
    logger.info("[STEP 2] Done → %d matches (%.1fs stage2, %.1fs total)", len(matches), timings["stage2"], total)

    log_query(
        slack_user_id=slack_user_id, company_name=company_name, ask_text=ask,
        result_type="matches",
        match_ids=[m["contact_id"] for m in matches],
        match_names=[m["name"] for m in matches],
        clarity_secs=timings["clarity"], stage1_secs=timings["stage1"],
        stage2_secs=timings["stage2"], total_secs=total,
    )

    return {
        "type": "matches",
        "clarifying_question": None,
        "matches": matches,
        "notes": None,
    }
