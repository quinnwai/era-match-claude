import time
import logging
from pydantic import BaseModel

from src.backends.base import LLMBackend
from src.config import GEMINI_API_KEY, GEMINI_STAGE1_MODEL, GEMINI_STAGE2_MODEL, GEMINI_CLARITY_MODEL

logger = logging.getLogger(__name__)


class GeminiBackend(LLMBackend):
    """Gemini backend using Google GenAI API with native response schemas and extended thinking."""

    def __init__(self):
        from google import genai
        self.client = genai.Client(api_key=GEMINI_API_KEY)

    def _generate_with_retry(self, model, contents, config, max_retries=1):
        """Call Gemini API with retry logic."""
        from google.genai.types import GenerateContentConfig, ThinkingConfig
        last_err = None
        for attempt in range(1 + max_retries):
            try:
                start = time.time()
                response = self.client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=config,
                )
                elapsed = time.time() - start

                if hasattr(response, "usage_metadata") and response.usage_metadata:
                    usage = response.usage_metadata
                    logger.info(
                        "Gemini call: model=%s elapsed=%.1fs input=%s output=%s cached=%s",
                        model, elapsed,
                        getattr(usage, 'prompt_token_count', '?'),
                        getattr(usage, 'candidates_token_count', '?'),
                        getattr(usage, 'cached_content_token_count', 0),
                    )
                else:
                    logger.info("Gemini call: model=%s elapsed=%.1fs", model, elapsed)

                return response
            except (ConnectionError, TimeoutError, RuntimeError) as exc:
                last_err = exc
                if attempt < max_retries:
                    wait = 2 ** attempt
                    logger.warning("Gemini call failed (attempt %d), retrying in %ds: %s", attempt + 1, wait, exc)
                    time.sleep(wait)
                else:
                    raise
        raise last_err

    def assess_clarity(self, ask, company_context, system_prompt, response_schema):
        from google.genai.types import GenerateContentConfig, ThinkingConfig

        user_msg = (
            f"<company_context>\n{company_context}\n</company_context>\n\n"
            f"<ask>\n{ask}\n</ask>"
        )

        response = self._generate_with_retry(
            model=GEMINI_CLARITY_MODEL,
            contents=[{"role": "user", "parts": [{"text": user_msg}]}],
            config=GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
                response_schema=response_schema,
                max_output_tokens=8192,
                thinking_config=ThinkingConfig(thinking_budget=1024),
            ),
        )

        result = response_schema.model_validate_json(response.text)
        return result.model_dump()

    def screen_candidates(self, ask, company_context, compressed_profiles, system_prompt, response_schema):
        from google.genai.types import GenerateContentConfig, ThinkingConfig

        # Gemini: profiles go in user message, not system prompt
        # Strip the {profiles} placeholder from the system prompt
        formatted_system = system_prompt.replace("{profiles}", "").strip()
        # Clean up empty <profiles> tags if any remain
        formatted_system = formatted_system.replace("<profiles>\n\n</profiles>", "").strip()

        user_msg = (
            f"<profiles>\n{compressed_profiles}\n</profiles>\n\n"
            f"<company_context>\n{company_context}\n</company_context>\n\n"
            f"<ask>\n{ask}\n</ask>"
        )

        response = self._generate_with_retry(
            model=GEMINI_STAGE1_MODEL,
            contents=[{"role": "user", "parts": [{"text": user_msg}]}],
            config=GenerateContentConfig(
                system_instruction=formatted_system,
                response_mime_type="application/json",
                response_schema=response_schema,
                max_output_tokens=16384,
                thinking_config=ThinkingConfig(thinking_budget=4096),
            ),
        )

        result = response_schema.model_validate_json(response.text)
        return result.selected_contact_ids

    def rank_matches(self, ask, company_context, full_profiles, system_prompt, response_schema, top_k):
        from google.genai.types import GenerateContentConfig, ThinkingConfig

        formatted_system = system_prompt.format(
            company_context=company_context,
            full_profiles=full_profiles,
        )

        user_msg = f"<ask>\n{ask}\n</ask>\n\nReturn the top {top_k} matches."

        response = self._generate_with_retry(
            model=GEMINI_STAGE2_MODEL,
            contents=[{"role": "user", "parts": [{"text": user_msg}]}],
            config=GenerateContentConfig(
                system_instruction=formatted_system,
                response_mime_type="application/json",
                response_schema=response_schema,
                max_output_tokens=16384,
                thinking_config=ThinkingConfig(thinking_budget=4096),
            ),
        )

        result = response_schema.model_validate_json(response.text)
        return {"matches": [m.model_dump() for m in result.matches], "notes": result.notes}
