import time
import logging
from typing import Type
from pydantic import BaseModel
import anthropic

from src.backends.base import LLMBackend
from src.config import ANTHROPIC_API_KEY, STAGE1_MODEL, STAGE2_MODEL, CLARITY_MODEL, TOP_K_RESULTS

logger = logging.getLogger(__name__)


class ClaudeBackend(LLMBackend):
    """Claude backend using Anthropic API with tool-use and prompt caching."""

    def __init__(self):
        self.client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    def _tool_use_call(self, model, system, messages, schema_class, tool_name, retries=1, **kwargs):
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
                message = self.client.messages.create(
                    model=model,
                    max_tokens=4096,
                    system=system,
                    messages=messages,
                    tools=tools,
                    tool_choice={"type": "tool", "name": tool_name},
                    **kwargs,
                )
                elapsed = time.time() - start

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

    def assess_clarity(self, ask, company_context, system_prompt, response_schema):
        result = self._tool_use_call(
            model=CLARITY_MODEL,
            system=[{"type": "text", "text": system_prompt}],
            messages=[{
                "role": "user",
                "content": f"<company_context>\n{company_context}\n</company_context>\n\n<ask>\n{ask}\n</ask>",
            }],
            schema_class=response_schema,
            tool_name="report_clarity",
        )
        return result.model_dump()

    def screen_candidates(self, ask, company_context, compressed_profiles, system_prompt, response_schema):
        formatted_prompt = system_prompt.format(profiles=compressed_profiles)

        result = self._tool_use_call(
            model=STAGE1_MODEL,
            system=[{
                "type": "text",
                "text": formatted_prompt,
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{
                "role": "user",
                "content": f"<company_context>\n{company_context}\n</company_context>\n\n<ask>\n{ask}\n</ask>",
            }],
            schema_class=response_schema,
            tool_name="report_screening",
            extra_headers={"anthropic-beta": "prompt-caching-2024-07-31"},
        )
        return result.selected_contact_ids

    def rank_matches(self, ask, company_context, full_profiles, system_prompt, response_schema, top_k):
        formatted_prompt = system_prompt.format(
            company_context=company_context,
            full_profiles=full_profiles,
        )

        result = self._tool_use_call(
            model=STAGE2_MODEL,
            system=[{"type": "text", "text": formatted_prompt}],
            messages=[{
                "role": "user",
                "content": f"<ask>\n{ask}\n</ask>\n\nReturn the top {top_k} matches.",
            }],
            schema_class=response_schema,
            tool_name="report_ranking",
        )
        return [m.model_dump() for m in result.matches]
