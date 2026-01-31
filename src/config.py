import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Paths
PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = str(PROJECT_ROOT / "era_network_lite.db")

# API keys
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
SLACK_BOT_TOKEN = os.getenv("SLACK_BOT_TOKEN", "")
SLACK_APP_TOKEN = os.getenv("SLACK_APP_TOKEN", "")

# Model config
STAGE1_MODEL = "claude-sonnet-4-5-20250929"
STAGE2_MODEL = "claude-sonnet-4-5-20250929"
CLARITY_MODEL = "claude-sonnet-4-5-20250929"

# Pipeline defaults
STAGE1_MIN_CANDIDATES = 15
STAGE1_MAX_CANDIDATES = 30
TOP_K_RESULTS = 3
