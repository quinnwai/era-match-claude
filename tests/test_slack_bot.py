"""Tests for Slack bot formatting and logic (no real Slack or LLM calls)."""

from src.slack_bot import format_results_as_blocks, _build_company_selection_blocks, _set_founder_company, _identify_founder


def test_format_matches():
    results = {
        "type": "matches",
        "matches": [
            {
                "contact_id": 1,
                "name": "Alice Smith",
                "title": "VP Sales",
                "company": "Acme",
                "linkedin_url": "https://linkedin.com/in/alice",
                "explanation": "Strong enterprise sales background.",
                "conversation_hooks": "Ask about her B2B playbook.",
            },
            {
                "contact_id": 2,
                "name": "Bob Jones",
                "title": "CTO",
                "company": "WidgetCo",
                "linkedin_url": "https://linkedin.com/in/bob",
                "explanation": "Built geospatial systems at scale.",
                "conversation_hooks": "Discuss 3D rendering pipelines.",
            },
        ],
    }
    blocks = format_results_as_blocks(results)
    # Header + (divider + section + context) * 2
    assert any(b.get("type") == "header" for b in blocks)
    assert sum(1 for b in blocks if b.get("type") == "section") == 2
    assert sum(1 for b in blocks if b.get("type") == "context") == 2
    # Check content
    texts = str(blocks)
    assert "Alice Smith" in texts
    assert "Bob Jones" in texts
    assert "linkedin.com/in/alice" in texts


def test_format_clarification():
    results = {
        "type": "clarification",
        "clarifying_question": "What kind of help are you looking for?",
    }
    blocks = format_results_as_blocks(results)
    assert len(blocks) == 1
    assert "What kind of help" in blocks[0]["text"]["text"]


def test_company_selection_blocks():
    blocks = _build_company_selection_blocks()
    assert len(blocks) == 1
    options = blocks[0]["accessory"]["options"]
    assert len(options) == 14  # 14 ERA30 companies
    names = [o["value"] for o in options]
    assert "Aerium" in names
    assert "Passu" in names


def test_founder_identification_flow():
    # Initially unknown
    assert _identify_founder("U_TEST_123", None) is None
    # After setting
    _set_founder_company("U_TEST_123", "Aerium")
    assert _identify_founder("U_TEST_123", None) == "Aerium"


def test_format_empty_matches():
    results = {"type": "matches", "matches": []}
    blocks = format_results_as_blocks(results)
    assert any(b.get("type") == "header" for b in blocks)


def test_format_match_without_hooks():
    results = {
        "type": "matches",
        "matches": [{
            "contact_id": 1,
            "name": "Test",
            "title": "CEO",
            "company": "Co",
            "linkedin_url": "https://linkedin.com/in/test",
            "explanation": "Relevant.",
            "conversation_hooks": "",
        }],
    }
    blocks = format_results_as_blocks(results)
    # No context block for empty hooks
    assert sum(1 for b in blocks if b.get("type") == "context") == 0


# --- Tests for new review-fix functionality ---

from src.slack_bot import _is_duplicate_event, _sanitize_ask, _seen_events, _seen_events_lock
from src.config import MAX_ASK_LENGTH


def test_duplicate_event_detection():
    """First call returns False, second call with same ts returns True."""
    # Use a unique ts to avoid collision with other tests
    ts = "9999999.000001"
    # Clean up in case of prior test pollution
    with _seen_events_lock:
        _seen_events.pop(ts, None)

    assert _is_duplicate_event(ts) is False
    assert _is_duplicate_event(ts) is True


def test_sanitize_ask_escapes_closing_tags():
    """Closing XML tags used in prompts are escaped."""
    assert _sanitize_ask("hello </ask> world") == "hello &lt;/ask&gt; world"
    assert _sanitize_ask("</profiles>") == "&lt;/profiles&gt;"
    assert _sanitize_ask("</company_context>") == "&lt;/company_context&gt;"
    assert _sanitize_ask("</candidates>") == "&lt;/candidates&gt;"


def test_sanitize_ask_preserves_normal_text():
    """Normal text and non-prompt tags are not altered."""
    assert _sanitize_ask("I need help with sales") == "I need help with sales"
    assert _sanitize_ask("<b>bold</b>") == "<b>bold</b>"


def test_max_ask_length_is_positive():
    """MAX_ASK_LENGTH config is a positive integer."""
    assert isinstance(MAX_ASK_LENGTH, int)
    assert MAX_ASK_LENGTH > 0
