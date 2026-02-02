"""Tests for query logging (no LLM or Slack calls)."""
import os
import sqlite3

import src.query_log as ql


def _use_temp_db(tmp_path):
    """Point the log module at a temp DB for test isolation."""
    db_path = os.path.join(tmp_path, "test_log.db")
    ql.LOG_DB_PATH = db_path
    return db_path


def test_log_query_matches(tmp_path):
    db_path = _use_temp_db(tmp_path)
    rid = ql.log_query(
        slack_user_id="U123", company_name="Aerium",
        ask_text="find me sales people", result_type="matches",
        match_ids=[10, 20, 30], match_names=["A", "B", "C"],
        clarity_secs=1.5, stage1_secs=10.0, stage2_secs=5.0, total_secs=16.5,
    )
    assert rid >= 1

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    row = dict(conn.execute("SELECT * FROM query_log WHERE id=?", (rid,)).fetchone())
    conn.close()

    assert row["slack_user_id"] == "U123"
    assert row["company_name"] == "Aerium"
    assert row["ask_text"] == "find me sales people"
    assert row["result_type"] == "matches"
    assert "10" in row["match_ids"]
    assert row["total_secs"] == 16.5


def test_log_query_clarification(tmp_path):
    db_path = _use_temp_db(tmp_path)
    rid = ql.log_query(
        slack_user_id="U456", company_name="Kandir",
        ask_text="help?", result_type="clarification",
        clarifying_question="What kind of help?",
        clarity_secs=2.0, total_secs=2.0,
    )
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    row = dict(conn.execute("SELECT * FROM query_log WHERE id=?", (rid,)).fetchone())
    conn.close()

    assert row["result_type"] == "clarification"
    assert row["clarifying_question"] == "What kind of help?"
    assert row["match_ids"] is None


def test_log_feedback(tmp_path):
    db_path = _use_temp_db(tmp_path)
    ql.log_query(
        slack_user_id="U789", company_name="Passu",
        ask_text="credit experts", result_type="matches",
    )
    ql.log_feedback(
        slack_user_id="U789", channel="C123", message_ts="123.456", reaction="+1",
    )
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    row = dict(conn.execute("SELECT * FROM query_log WHERE slack_user_id='U789'").fetchone())
    conn.close()

    assert row["feedback"] == "+1"


def test_multiple_queries_feedback_updates_latest(tmp_path):
    db_path = _use_temp_db(tmp_path)
    rid1 = ql.log_query(slack_user_id="U999", company_name="Aerium", ask_text="first", result_type="matches")
    rid2 = ql.log_query(slack_user_id="U999", company_name="Aerium", ask_text="second", result_type="matches")

    ql.log_feedback(slack_user_id="U999", channel="C1", message_ts="1.0", reaction="-1")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    row1 = dict(conn.execute("SELECT * FROM query_log WHERE id=?", (rid1,)).fetchone())
    row2 = dict(conn.execute("SELECT * FROM query_log WHERE id=?", (rid2,)).fetchone())
    conn.close()

    assert row1["feedback"] is None
    assert row2["feedback"] == "-1"
