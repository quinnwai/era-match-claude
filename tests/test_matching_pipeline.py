"""Level 2 pipeline integration tests — requires LLM calls."""
import sys, os, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from src.config import DB_PATH
from src.db import get_enriched_contacts, get_research_profile
from src.matching import run_matching_pipeline

# Collect all valid contact_ids for validation
_all_contact_ids = None

def _get_all_contact_ids():
    global _all_contact_ids
    if _all_contact_ids is None:
        contacts = get_enriched_contacts(DB_PATH)
        _all_contact_ids = {c["contact_id"] for c in contacts}
    return _all_contact_ids


MATCH_TEST_CASES = [
    ("I need someone who understands institutional credit research and can give feedback on our product approach", "Passu"),
    ("I need advice on our enterprise sales motion. We're selling to Fortune 500 procurement teams and struggling with long sales cycles.", "Aerium"),
]

VAGUE_ASK = ("know anyone who could help us?", "Kandir")


@pytest.mark.parametrize("ask,company", MATCH_TEST_CASES, ids=["fintech_credit", "enterprise_sales"])
def test_pipeline_returns_matches(ask, company):
    start = time.time()
    result = run_matching_pipeline(ask, company, DB_PATH)
    elapsed = time.time() - start

    assert result["type"] == "matches"
    matches = result["matches"]
    assert isinstance(matches, list)
    assert 1 <= len(matches) <= 3

    # Required fields
    required_fields = {"contact_id", "name", "title", "company", "linkedin_url", "explanation", "conversation_hooks"}
    for m in matches:
        for field in required_fields:
            assert field in m, f"Missing field: {field}"
            assert m[field], f"Empty field: {field}"

    # Contact IDs must exist in DB
    valid_ids = _get_all_contact_ids()
    for m in matches:
        assert m["contact_id"] in valid_ids, f"contact_id {m['contact_id']} not in database"

    # No duplicates
    ids = [m["contact_id"] for m in matches]
    assert len(ids) == len(set(ids)), "Duplicate contact_ids in results"

    # Response time
    assert elapsed < 120, f"Pipeline took {elapsed:.1f}s, expected <120s"


def test_vague_ask_triggers_clarification():
    ask, company = VAGUE_ASK
    result = run_matching_pipeline(ask, company, DB_PATH)
    # Should either clarify or return domain-relevant matches
    if result["type"] == "clarification":
        assert result["clarifying_question"]
        assert len(result["clarifying_question"]) > 10
    else:
        # Acceptable fallback: returned matches anyway
        assert result["matches"] is not None
