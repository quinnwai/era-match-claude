import os
from pathlib import Path
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).parent.parent
load_dotenv(PROJECT_ROOT / ".env", override=True)
DB_PATH = str(PROJECT_ROOT / "era_network_lite.db")

# API keys
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
SLACK_BOT_TOKEN = os.getenv("SLACK_BOT_TOKEN", "")
SLACK_APP_TOKEN = os.getenv("SLACK_APP_TOKEN", "")

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

# Input limits
MAX_ASK_LENGTH = int(os.getenv("MAX_ASK_LENGTH", "2000"))
