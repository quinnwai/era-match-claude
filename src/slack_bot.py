import os
import logging
import threading
from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler

from src.config import SLACK_BOT_TOKEN, SLACK_APP_TOKEN, ANTHROPIC_API_KEY, DB_PATH, MAX_ASK_LENGTH
from src.matching import run_matching_pipeline
from src.db import get_all_era30_companies

logger = logging.getLogger(__name__)

# Defer App initialization to start() so module can be imported without auth
_app: App | None = None

# Thread-safe in-memory store for founder -> company mapping
_state_lock = threading.Lock()
_user_company_map: dict[str, str] = {}
# Track threads where the bot was invoked so we only handle follow-ups there
_active_threads: set[str] = set()


def _identify_founder(user_id: str, client) -> str | None:
    """Try to match a Slack user to an ERA30 company."""
    with _state_lock:
        return _user_company_map.get(user_id)


def _set_founder_company(user_id: str, company_name: str):
    """Store the founder's company mapping."""
    with _state_lock:
        _user_company_map[user_id] = company_name


def _mark_thread_active(thread_ts: str):
    """Record a thread where the bot was invoked."""
    with _state_lock:
        _active_threads.add(thread_ts)


def _is_thread_active(thread_ts: str) -> bool:
    """Check if a thread was started by the bot."""
    with _state_lock:
        return thread_ts in _active_threads


def _build_company_selection_blocks() -> list[dict]:
    """Build Block Kit blocks for company selection."""
    companies = get_all_era30_companies(DB_PATH)
    options = [
        {
            "text": {"type": "plain_text", "text": c["name"]},
            "value": c["name"],
        }
        for c in companies
    ]
    return [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": "Welcome to the ERA Network Bot! Which ERA30 company are you with?",
            },
            "accessory": {
                "type": "static_select",
                "placeholder": {"type": "plain_text", "text": "Select your company"},
                "action_id": "select_company",
                "options": options,
            },
        }
    ]


def _escape_mrkdwn(text: str) -> str:
    """Escape Slack special characters in LLM-generated text."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def format_results_as_blocks(results: dict) -> list[dict]:
    """Format pipeline results as Slack Block Kit blocks."""
    if results["type"] == "clarification":
        return [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f":thinking_face: {_escape_mrkdwn(results['clarifying_question'] or '')}",
                },
            }
        ]

    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": ":sparkles: Network Matches"},
        }
    ]

    for i, match in enumerate(results.get("matches") or [], 1):
        blocks.append({"type": "divider"})
        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": (
                    f"*{i}. {_escape_mrkdwn(match['name'])}*\n"
                    f"{_escape_mrkdwn(match['title'])} at {_escape_mrkdwn(match['company'])}\n"
                    f"<{match['linkedin_url']}|LinkedIn Profile>\n\n"
                    f"{_escape_mrkdwn(match['explanation'])}"
                ),
            },
        })
        if match.get("conversation_hooks"):
            blocks.append({
                "type": "context",
                "elements": [{
                    "type": "mrkdwn",
                    "text": f":speech_balloon: *Conversation starter:* {_escape_mrkdwn(match['conversation_hooks'])}",
                }],
            })

    return blocks


def _process_ask(event, client):
    """Process a founder's ask: identify company, run clarity/screen/rank pipeline, post results.

    Handles company identification (prompts selection if unknown), input validation,
    thinking indicator, and error reporting back to the Slack thread.
    """
    user_id = event["user"]
    channel = event["channel"]
    thread_ts = event.get("thread_ts") or event["ts"]

    # Mark this thread as active so follow-up messages are handled
    _mark_thread_active(thread_ts)
    text = event.get("text", "").strip()

    logger.info("[RECV] user=%s channel=%s thread_ts=%s text=%r", user_id, channel, thread_ts, text[:100])

    # Remove bot mention if present
    if text.startswith("<@"):
        text = text.split(">", 1)[-1].strip()

    if not text:
        logger.info("[SKIP] Empty text after cleanup")
        return

    if len(text) > MAX_ASK_LENGTH:
        client.chat_postMessage(
            channel=channel,
            thread_ts=thread_ts,
            text=f":warning: Your message is too long ({len(text)} chars). Please keep asks under {MAX_ASK_LENGTH} characters.",
        )
        return

    # Check if founder is identified
    company_name = _identify_founder(user_id, client)
    if not company_name:
        logger.info("[ID] Founder not identified, sending company selection")
        client.chat_postMessage(
            channel=channel,
            thread_ts=thread_ts,
            blocks=_build_company_selection_blocks(),
            text="Which ERA30 company are you with?",
        )
        return

    logger.info("[PIPELINE] Starting pipeline for company=%s ask=%r", company_name, text[:80])

    # Post thinking indicator
    thinking = client.chat_postMessage(
        channel=channel,
        thread_ts=thread_ts,
        text=":mag: Searching the ERA network...",
    )
    logger.info("[PIPELINE] Posted thinking indicator")

    try:
        results = run_matching_pipeline(text, company_name, DB_PATH, slack_user_id=user_id)
        logger.info("[PIPELINE] Complete — type=%s matches=%d",
                     results["type"],
                     len(results.get("matches") or []))
        blocks = format_results_as_blocks(results)
        client.chat_update(
            channel=channel,
            ts=thinking["ts"],
            blocks=blocks,
            text="Here are your matches",
        )
        logger.info("[PIPELINE] Results posted to Slack")
    except Exception as e:
        logger.exception("[PIPELINE] Error: %s", e)
        client.chat_update(
            channel=channel,
            ts=thinking["ts"],
            text=":warning: Sorry, I ran into an issue searching the network. Please try again.",
        )


def _register_handlers(app: App):
    """Register event and action handlers on the app."""

    @app.event("message")
    def handle_message(event, client):
        logger.info("[EVENT] message: channel_type=%s bot_id=%s subtype=%s user=%s thread_ts=%s text=%r",
                     event.get("channel_type"), event.get("bot_id"), event.get("subtype"),
                     event.get("user"), event.get("thread_ts"), (event.get("text") or "")[:80])
        if event.get("subtype") or event.get("bot_id"):
            return
        # Process DMs
        if event.get("channel_type") == "im":
            _process_ask(event, client)
            return
        # Process threaded replies only in threads the bot previously participated in
        if event.get("thread_ts") and _is_thread_active(event["thread_ts"]):
            _process_ask(event, client)

    @app.event("app_mention")
    def handle_mention(event, client):
        logger.info("[EVENT] app_mention: user=%s text=%r", event.get("user"), (event.get("text") or "")[:80])
        if not event.get("bot_id"):
            _process_ask(event, client)

    @app.action("select_company")
    def handle_company_selection(ack, body, client):
        ack()
        logger.info("[ACTION] select_company fired — body keys: %s", list(body.keys()))
        user_id = body["user"]["id"]
        selected = body["actions"][0]["selected_option"]["value"]
        _set_founder_company(user_id, selected)
        logger.info("[ACTION] Company set: user=%s company=%s", user_id, selected)
        channel = body["channel"]["id"]
        # Thread the reply under the message containing the dropdown
        message_ts = body.get("message", {}).get("ts") or body.get("container", {}).get("message_ts")
        client.chat_postMessage(
            channel=channel,
            thread_ts=message_ts,
            text=f":white_check_mark: Got it, you're with *{selected}*. Now @mention me with your ask, e.g. `@ERA Network Bot I need someone who understands enterprise sales`",
        )

    @app.event("reaction_added")
    def handle_reaction(event, client):
        """Log feedback reactions (thumbsup/thumbsdown) on bot messages."""
        from src.query_log import log_feedback
        reaction = event.get("reaction", "")
        if reaction in ("+1", "thumbsup", "-1", "thumbsdown"):
            logger.info(
                "Feedback: user=%s reaction=%s channel=%s ts=%s",
                event.get("user"), reaction, event.get("item", {}).get("channel"), event.get("item", {}).get("ts"),
            )
            log_feedback(
                slack_user_id=event.get("user", ""),
                channel=event.get("item", {}).get("channel", ""),
                message_ts=event.get("item", {}).get("ts", ""),
                reaction=reaction,
            )


def start():
    """Start the Slack bot via Socket Mode."""
    logging.basicConfig(level=logging.INFO)

    # Fail fast if required secrets are missing
    if not SLACK_BOT_TOKEN:
        raise RuntimeError("SLACK_BOT_TOKEN is not set — check .env or Secret Manager")
    if not SLACK_APP_TOKEN:
        raise RuntimeError("SLACK_APP_TOKEN is not set — check .env or Secret Manager")
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is not set — check .env or Secret Manager")

    global _app
    _app = App(token=SLACK_BOT_TOKEN)

    # Catch-all middleware: logs EVERY incoming request before handlers run
    @_app.middleware
    def log_all_requests(body, next, logger=logger):
        event = body.get("event", {})
        action_type = body.get("type", "?")
        logger.info(
            "[RAW] type=%s event_type=%s subtype=%s user=%s channel=%s thread_ts=%s text=%r",
            action_type,
            event.get("type", body.get("command", "?")),
            event.get("subtype"),
            event.get("user", body.get("user", {}).get("id") if isinstance(body.get("user"), dict) else None),
            event.get("channel", body.get("channel", {}).get("id") if isinstance(body.get("channel"), dict) else None),
            event.get("thread_ts"),
            (event.get("text") or "")[:100],
        )
        next()

    _register_handlers(_app)
    handler = SocketModeHandler(_app, SLACK_APP_TOKEN)
    logger.info("ERA Network Bot starting...")
    handler.start()
