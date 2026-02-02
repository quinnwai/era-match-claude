import sqlite3
import json
import time
import logging
from contextlib import closing
from pathlib import Path

from src.config import PROJECT_ROOT

logger = logging.getLogger(__name__)

LOG_DB_PATH = str(PROJECT_ROOT / "era_query_log.db")

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS query_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp REAL NOT NULL,
    slack_user_id TEXT,
    company_name TEXT,
    ask_text TEXT NOT NULL,
    result_type TEXT NOT NULL,
    clarifying_question TEXT,
    match_ids TEXT,
    match_names TEXT,
    clarity_secs REAL,
    stage1_secs REAL,
    stage2_secs REAL,
    total_secs REAL,
    feedback TEXT,
    created_at TEXT DEFAULT (datetime('now'))
)
"""


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(LOG_DB_PATH)
    conn.execute(_CREATE_TABLE)
    return conn


def log_query(
    slack_user_id: str | None,
    company_name: str | None,
    ask_text: str,
    result_type: str,
    clarifying_question: str | None = None,
    match_ids: list[int] | None = None,
    match_names: list[str] | None = None,
    clarity_secs: float | None = None,
    stage1_secs: float | None = None,
    stage2_secs: float | None = None,
    total_secs: float | None = None,
) -> int:
    """Log a query and return the row ID."""
    with closing(_connect()) as conn:
        cur = conn.execute(
            """INSERT INTO query_log
               (timestamp, slack_user_id, company_name, ask_text, result_type,
                clarifying_question, match_ids, match_names,
                clarity_secs, stage1_secs, stage2_secs, total_secs)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                time.time(),
                slack_user_id,
                company_name,
                ask_text,
                result_type,
                clarifying_question,
                json.dumps(match_ids) if match_ids else None,
                json.dumps(match_names) if match_names else None,
                clarity_secs,
                stage1_secs,
                stage2_secs,
                total_secs,
            ),
        )
        row_id = cur.lastrowid
        conn.commit()
        logger.info("[LOG] Query logged: id=%d type=%s company=%s", row_id, result_type, company_name)
        return row_id


def log_feedback(slack_user_id: str, channel: str, message_ts: str, reaction: str):
    """Log a feedback reaction. Tries to match it to the most recent query from this user."""
    with closing(_connect()) as conn:
        conn.execute(
            """UPDATE query_log SET feedback = ?
               WHERE id = (
                   SELECT id FROM query_log
                   WHERE slack_user_id = ?
                   ORDER BY timestamp DESC LIMIT 1
               )""",
            (reaction, slack_user_id),
        )
        conn.commit()
        logger.info("[LOG] Feedback logged: user=%s reaction=%s", slack_user_id, reaction)
