import time
import logging
import threading
from pydantic import BaseModel

from src.backends import get_backend
from src.config import LLM_PROVIDER, DB_PATH, TOP_K_RESULTS
from src.prompts import CLARITY_SYSTEM_PROMPT, STAGE1_SYSTEM_PROMPT, STAGE2_SYSTEM_PROMPT
from src.profiles import get_compressed_profiles, get_full_profiles
from src.db import get_company_context

logger = logging.getLogger(__name__)


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


# --- Backend singleton ---

_backend = None
_backend_lock = threading.Lock()


def _get_backend():
    global _backend
    if _backend is None:
        with _backend_lock:
            if _backend is None:
                _backend = get_backend(LLM_PROVIDER)
                logger.info("Initialized LLM backend: %s", LLM_PROVIDER)
    return _backend


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
    backend = _get_backend()
    return backend.assess_clarity(
        ask=ask,
        company_context=company_context,
        system_prompt=CLARITY_SYSTEM_PROMPT,
        response_schema=ClarityResult,
    )


def stage1_screen(ask: str, company_context: str, compressed_profiles: str) -> list[int]:
    """Screen ~800 compressed profiles, return 15-30 candidate contact_ids."""
    backend = _get_backend()
    return backend.screen_candidates(
        ask=ask,
        company_context=company_context,
        compressed_profiles=compressed_profiles,
        system_prompt=STAGE1_SYSTEM_PROMPT,
        response_schema=Stage1Result,
    )


def stage2_rank(ask: str, company_context: str, full_profiles: str) -> dict:
    """Rank 15-30 candidates down to top 3 with explanations. Returns {matches, notes}."""
    backend = _get_backend()
    return backend.rank_matches(
        ask=ask,
        company_context=company_context,
        full_profiles=full_profiles,
        system_prompt=STAGE2_SYSTEM_PROMPT,
        response_schema=Stage2Result,
        top_k=TOP_K_RESULTS,
    )


def run_matching_pipeline(ask: str, company_name: str, db_path: str = DB_PATH, slack_user_id: str | None = None) -> dict:
    """Full pipeline: clarity check -> stage1 -> stage2 -> formatted results."""
    from src.query_log import log_query

    t0 = time.time()
    timings = {}

    company = get_company_context(db_path, company_name)
    company_ctx = _format_company_context(company)
    logger.info("[STEP 0] Clarity check starting — company=%s ask=%r", company_name, ask[:80])

    # Step 0: Clarity check
    clarity = assess_ask_clarity(ask, company_ctx)
    timings["clarity"] = time.time() - t0
    logger.info("[STEP 0] Clarity result: is_clear=%s (%.1fs elapsed)", clarity["is_clear"], timings["clarity"])
    if not clarity["is_clear"]:
        logger.info("[STEP 0] Returning clarifying question")
        log_query(
            slack_user_id=slack_user_id, company_name=company_name, ask_text=ask,
            result_type="clarification", clarifying_question=clarity["clarifying_question"],
            clarity_secs=timings["clarity"], total_secs=time.time() - t0,
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
    t1 = time.time()
    candidate_ids = stage1_screen(ask, company_ctx, compressed)
    timings["stage1"] = time.time() - t1
    logger.info("[STEP 1] Screened → %d candidates (%.1fs stage1, %.1fs elapsed)", len(candidate_ids), timings["stage1"], time.time() - t0)

    # Step 2: Rank
    logger.info("[STEP 2] Building full profiles for %d candidates...", len(candidate_ids))
    full_profiles = get_full_profiles(db_path, candidate_ids)
    logger.info("[STEP 2] Ranking...")
    t2 = time.time()
    stage2_result = stage2_rank(ask, company_ctx, full_profiles)
    matches = stage2_result["matches"]
    notes = stage2_result.get("notes")
    timings["stage2"] = time.time() - t2
    total = time.time() - t0
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
        "notes": notes,
    }
