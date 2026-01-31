import os
import logging
from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler

from src.config import SLACK_BOT_TOKEN, SLACK_APP_TOKEN, DB_PATH
from src.matching import run_matching_pipeline
from src.db import get_all_era30_companies

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Defer App initialization to start() so module can be imported without auth
_app: App | None = None

# In-memory store for founder -> company mapping (per Slack user ID)
_user_company_map: dict[str, str] = {}


def _identify_founder(user_id: str, client) -> str | None:
    """Try to match a Slack user to an ERA30 company."""
    if user_id in _user_company_map:
        return _user_company_map[user_id]
    return None


def _set_founder_company(user_id: str, company_name: str):
    """Store the founder's company mapping."""
    _user_company_map[user_id] = company_name


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


def format_results_as_blocks(results: dict) -> list[dict]:
    """Format pipeline results as Slack Block Kit blocks."""
    if results["type"] == "clarification":
        return [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f":thinking_face: {results['clarifying_question']}",
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
                    f"*{i}. {match['name']}*\n"
                    f"{match['title']} at {match['company']}\n"
                    f"<{match['linkedin_url']}|LinkedIn Profile>\n\n"
                    f"{match['explanation']}"
                ),
            },
        })
        if match.get("conversation_hooks"):
            blocks.append({
                "type": "context",
                "elements": [{
                    "type": "mrkdwn",
                    "text": f":speech_balloon: *Conversation starter:* {match['conversation_hooks']}",
                }],
            })

    return blocks


def _process_ask(event, client):
    """Process a founder's ask through the matching pipeline."""
    user_id = event["user"]
    channel = event["channel"]
    thread_ts = event.get("thread_ts") or event["ts"]
    text = event.get("text", "").strip()

    # Remove bot mention if present
    if text.startswith("<@"):
        text = text.split(">", 1)[-1].strip()

    if not text:
        return

    # Check if founder is identified
    company_name = _identify_founder(user_id, client)
    if not company_name:
        client.chat_postMessage(
            channel=channel,
            thread_ts=thread_ts,
            blocks=_build_company_selection_blocks(),
            text="Which ERA30 company are you with?",
        )
        return

    # Post thinking indicator
    thinking = client.chat_postMessage(
        channel=channel,
        thread_ts=thread_ts,
        text=":mag: Searching the ERA network...",
    )

    try:
        results = run_matching_pipeline(text, company_name, DB_PATH)
        blocks = format_results_as_blocks(results)
        client.chat_update(
            channel=channel,
            ts=thinking["ts"],
            blocks=blocks,
            text="Here are your matches",
        )
    except Exception as e:
        logger.exception("Pipeline error")
        client.chat_update(
            channel=channel,
            ts=thinking["ts"],
            text=":warning: Sorry, I ran into an issue searching the network. Please try again.",
        )


def _register_handlers(app: App):
    """Register event and action handlers on the app."""

    @app.event("message")
    def handle_dm(event, client):
        if event.get("channel_type") == "im" and not event.get("bot_id"):
            _process_ask(event, client)

    @app.event("app_mention")
    def handle_mention(event, client):
        if not event.get("bot_id"):
            _process_ask(event, client)

    @app.action("select_company")
    def handle_company_selection(ack, body, client):
        ack()
        user_id = body["user"]["id"]
        selected = body["actions"][0]["selected_option"]["value"]
        _set_founder_company(user_id, selected)
        channel = body["channel"]["id"]
        client.chat_postMessage(
            channel=channel,
            text=f":white_check_mark: Got it, you're with *{selected}*. What can I help you find in the ERA network?",
        )


def start():
    """Start the Slack bot via Socket Mode."""
    global _app
    _app = App(token=SLACK_BOT_TOKEN)
    _register_handlers(_app)
    handler = SocketModeHandler(_app, SLACK_APP_TOKEN)
    logger.info("ERA Network Bot starting...")
    handler.start()
