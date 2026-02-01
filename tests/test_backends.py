import os
import pytest
from src.backends import get_backend
from src.backends.base import LLMBackend


def test_backend_registry_claude():
    """Claude backend can be instantiated."""
    backend = get_backend("claude")
    assert isinstance(backend, LLMBackend)


def test_backend_registry_gemini():
    """Gemini backend can be instantiated."""
    if not os.getenv("GEMINI_API_KEY"):
        pytest.skip("GEMINI_API_KEY not set")
    backend = get_backend("gemini")
    assert isinstance(backend, LLMBackend)


def test_backend_registry_unknown():
    """Unknown provider raises ValueError."""
    with pytest.raises(ValueError, match="Unknown provider"):
        get_backend("nonexistent")


def test_backend_has_required_methods():
    """Backend instances expose the required interface."""
    backend = get_backend("claude")
    assert hasattr(backend, "assess_clarity")
    assert hasattr(backend, "screen_candidates")
    assert hasattr(backend, "rank_matches")


@pytest.mark.skipif(not os.getenv("ANTHROPIC_API_KEY"), reason="No Claude API key")
def test_claude_backend_clarity():
    """Integration test: Claude clarity check."""
    from src.prompts import CLARITY_SYSTEM_PROMPT
    from src.matching import ClarityResult

    backend = get_backend("claude")
    result = backend.assess_clarity(
        ask="I need help with enterprise sales",
        company_context="Company: TestCo\nIndustry: SaaS",
        system_prompt=CLARITY_SYSTEM_PROMPT,
        response_schema=ClarityResult,
    )
    assert "is_clear" in result


@pytest.mark.skipif(not os.getenv("GEMINI_API_KEY"), reason="No Gemini API key")
def test_gemini_backend_clarity():
    """Integration test: Gemini clarity check."""
    from src.prompts import CLARITY_SYSTEM_PROMPT
    from src.matching import ClarityResult

    backend = get_backend("gemini")
    result = backend.assess_clarity(
        ask="I need help with enterprise sales",
        company_context="Company: TestCo\nIndustry: SaaS",
        system_prompt=CLARITY_SYSTEM_PROMPT,
        response_schema=ClarityResult,
    )
    assert "is_clear" in result
