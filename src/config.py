import os
import logging
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).parent.parent
load_dotenv(PROJECT_ROOT / ".env", override=True)
# Database path: use data/ dir if it exists (Docker), otherwise project root (local dev)
_data_dir = PROJECT_ROOT / "data"
if _data_dir.is_dir():
    DB_PATH = str(_data_dir / "era_network_lite.db")
else:
    DB_PATH = str(PROJECT_ROOT / "era_network_lite.db")

# --- GCP Secret Manager integration ---
GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID", "")

_SECRET_NAMES = {
    "ANTHROPIC_API_KEY": "anthropic-api-key",
    "SLACK_BOT_TOKEN": "slack-bot-token",
    "SLACK_APP_TOKEN": "slack-app-token",
}


def _get_secret(env_var: str) -> str:
    """Try env var first, then GCP Secret Manager, return empty string on failure."""
    val = os.getenv(env_var, "")
    if val:
        return val

    if not GCP_PROJECT_ID:
        return ""

    secret_id = _SECRET_NAMES.get(env_var)
    if not secret_id:
        return ""

    try:
        from google.cloud import secretmanager
        client = secretmanager.SecretManagerServiceClient()
        name = f"projects/{GCP_PROJECT_ID}/secrets/{secret_id}/versions/latest"
        response = client.access_secret_version(request={"name": name})
        val = response.payload.data.decode("UTF-8").strip()
        logger.info("Loaded %s from Secret Manager", env_var)
        return val
    except Exception as exc:
        logger.warning("Failed to load %s from Secret Manager: %s", env_var, exc)
        return ""


# API keys
ANTHROPIC_API_KEY = _get_secret("ANTHROPIC_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
SLACK_BOT_TOKEN = _get_secret("SLACK_BOT_TOKEN")
SLACK_APP_TOKEN = _get_secret("SLACK_APP_TOKEN")

# Backend selection
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "claude").lower()

# Claude model config
STAGE1_MODEL = "claude-sonnet-4-5-20250929"
STAGE2_MODEL = "claude-sonnet-4-5-20250929"
CLARITY_MODEL = "claude-sonnet-4-5-20250929"

# Gemini model config
GEMINI_STAGE1_MODEL = os.getenv("GEMINI_STAGE1_MODEL", "gemini-2.5-pro")
GEMINI_STAGE2_MODEL = os.getenv("GEMINI_STAGE2_MODEL", "gemini-2.5-pro")
GEMINI_CLARITY_MODEL = os.getenv("GEMINI_CLARITY_MODEL", "gemini-2.5-pro")

# Pipeline defaults
STAGE1_MIN_CANDIDATES = 15
STAGE1_MAX_CANDIDATES = 30
TOP_K_RESULTS = 3
MAX_ASK_LENGTH = 2000
