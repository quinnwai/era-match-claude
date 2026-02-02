"""Level 1 structural tests — no LLM calls."""
import tiktoken
from src.config import DB_PATH
from src.db import (
    get_enriched_contacts,
    get_research_profile,
    get_career_highlights,
    get_company_context,
    get_all_era30_companies,
)
from src.profiles import compress_profile, get_compressed_profiles, get_full_profiles


# --- DB layer tests ---

def test_enriched_contacts_count():
    contacts = get_enriched_contacts(DB_PATH)
    assert len(contacts) >= 700, f"Expected >=700 enriched contacts, got {len(contacts)}"


def test_enriched_contacts_have_required_fields():
    contacts = get_enriched_contacts(DB_PATH)
    required = {"contact_id", "full_name", "current_title", "primary_expertise"}
    for c in contacts[:10]:
        for field in required:
            assert field in c, f"Missing field {field}"
            assert c[field], f"Empty field {field} for contact {c.get('contact_id')}"


def test_research_profile_returns_data():
    contacts = get_enriched_contacts(DB_PATH)
    cid = contacts[0]["contact_id"]
    profile = get_research_profile(DB_PATH, cid)
    assert profile is not None
    assert profile["contact_id"] == cid


def test_research_profile_invalid_id():
    profile = get_research_profile(DB_PATH, -999)
    assert profile is None


def test_career_highlights():
    contacts = get_enriched_contacts(DB_PATH)
    cid = contacts[0]["contact_id"]
    career = get_career_highlights(DB_PATH, cid)
    assert isinstance(career, list)


def test_all_era30_companies():
    companies = get_all_era30_companies(DB_PATH)
    assert len(companies) == 14


def test_company_context_lookup():
    company_names = [
        "Aerium", "Astute Labs", "Cascade Geomatics", "Discernis",
        "Kandir", "MadeOnSite", "Passu", "Philter",
    ]
    for name in company_names:
        ctx = get_company_context(DB_PATH, name)
        assert ctx is not None, f"Company not found: {name}"
        assert ctx["name"].lower() == name.lower()


def test_company_context_case_insensitive():
    ctx = get_company_context(DB_PATH, "aerium")
    assert ctx is not None
    assert ctx["name"] == "Aerium"


def test_company_context_invalid():
    ctx = get_company_context(DB_PATH, "NonExistentCo")
    assert ctx is None


# --- Profile compression tests ---

def test_compress_profile_output():
    contacts = get_enriched_contacts(DB_PATH)
    compressed = compress_profile(contacts[0])
    assert f"[ID:{contacts[0]['contact_id']}]" in compressed
    assert contacts[0]["full_name"] in compressed


def test_compressed_profiles_all_contacts():
    compressed = get_compressed_profiles(DB_PATH, shuffle=False)
    contacts = get_enriched_contacts(DB_PATH)
    # Every contact_id should appear
    for c in contacts:
        assert f"[ID:{c['contact_id']}]" in compressed


def test_compressed_profiles_under_token_limit():
    compressed = get_compressed_profiles(DB_PATH, shuffle=False)
    enc = tiktoken.get_encoding("cl100k_base")
    token_count = len(enc.encode(compressed))
    assert token_count < 60000, f"Compressed profiles = {token_count} tokens, exceeds 60K limit"


def test_compressed_profiles_has_segment_markers():
    compressed = get_compressed_profiles(DB_PATH, shuffle=False)
    assert "--- PROFILES" in compressed


# --- Full profile tests ---

def test_full_profiles_single():
    contacts = get_enriched_contacts(DB_PATH)
    cid = contacts[0]["contact_id"]
    full = get_full_profiles(DB_PATH, [cid])
    assert f"[ID:{cid}]" in full
    assert "Primary Expertise:" in full


def test_full_profiles_multiple():
    contacts = get_enriched_contacts(DB_PATH)
    cids = [c["contact_id"] for c in contacts[:5]]
    full = get_full_profiles(DB_PATH, cids)
    for cid in cids:
        assert f"[ID:{cid}]" in full


def test_full_profiles_invalid_id_skipped():
    full = get_full_profiles(DB_PATH, [-999])
    assert full == ""
