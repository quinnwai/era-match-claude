"""Tests for Slack bot formatting and logic (no real Slack or LLM calls)."""
from unittest.mock import patch, MagicMock
import pytest

from src.slack_bot import (
    format_results_as_blocks,
    _build_company_selection_blocks,
    _set_founder_company,
    _identify_founder,
    _escape_mrkdwn,
    _mark_thread_active,
    _is_thread_active,
    _process_ask,
    start,
)


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


# --- mrkdwn escaping tests (#2) ---

def test_escape_mrkdwn_special_chars():
    assert _escape_mrkdwn("a & b") == "a &amp; b"
    assert _escape_mrkdwn("<script>") == "&lt;script&gt;"
    assert _escape_mrkdwn("<!channel>") == "&lt;!channel&gt;"
    assert _escape_mrkdwn("plain text") == "plain text"


def test_escape_mrkdwn_ampersand_before_angle():
    """Ampersand must be escaped first to avoid double-escaping."""
    assert _escape_mrkdwn("a & <b>") == "a &amp; &lt;b&gt;"


def test_format_results_escapes_match_fields():
    """LLM-generated fields with special chars should be escaped in output blocks."""
    results = {
        "type": "matches",
        "matches": [{
            "contact_id": 1,
            "name": "Alice <Admin>",
            "title": "VP & GM",
            "company": "A&B Corp",
            "linkedin_url": "https://linkedin.com/in/alice",
            "explanation": "Knows <!channel> people.",
            "conversation_hooks": "Ask about <her> strategy.",
        }],
    }
    blocks = format_results_as_blocks(results)
    text = str(blocks)
    # Raw special chars should NOT appear in output
    assert "<!channel>" not in text
    assert "<Admin>" not in text
    # Escaped versions should appear
    assert "&lt;Admin&gt;" in text
    assert "&lt;!channel&gt;" in text
    assert "VP &amp; GM" in text


def test_format_clarification_escapes_question():
    results = {
        "type": "clarification",
        "clarifying_question": "Can you be more specific? Use <details>.",
    }
    blocks = format_results_as_blocks(results)
    text = blocks[0]["text"]["text"]
    assert "<details>" not in text
    assert "&lt;details&gt;" in text


# --- Thread tracking tests (#7) ---

def test_thread_tracking_unknown_thread():
    assert _is_thread_active("9999.9999") is False


def test_thread_tracking_after_mark():
    ts = "1234.5678"
    _mark_thread_active(ts)
    assert _is_thread_active(ts) is True


# --- Input length limit test (#4) ---

@patch("src.slack_bot._identify_founder", return_value="Aerium")
@patch("src.slack_bot.run_matching_pipeline")
def test_process_ask_rejects_long_input(mock_pipeline, mock_founder):
    client = MagicMock()
    event = {
        "user": "U_LONG",
        "channel": "C123",
        "ts": "100.1",
        "text": "a" * 3000,
    }
    _process_ask(event, client)
    # Should post a warning, not call the pipeline
    mock_pipeline.assert_not_called()
    client.chat_postMessage.assert_called_once()
    msg = client.chat_postMessage.call_args
    assert "too long" in msg.kwargs.get("text", msg[1].get("text", ""))


# --- Startup validation test (#6) ---

def test_start_fails_on_missing_slack_bot_token():
    with patch("src.slack_bot.SLACK_BOT_TOKEN", ""), \
         patch("src.slack_bot.SLACK_APP_TOKEN", "xapp-test"), \
         patch("src.slack_bot.ANTHROPIC_API_KEY", "sk-test"):
        with pytest.raises(RuntimeError, match="SLACK_BOT_TOKEN"):
            start()


def test_start_fails_on_missing_anthropic_key():
    with patch("src.slack_bot.SLACK_BOT_TOKEN", "xoxb-test"), \
         patch("src.slack_bot.SLACK_APP_TOKEN", "xapp-test"), \
         patch("src.slack_bot.ANTHROPIC_API_KEY", ""):
        with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
            start()
