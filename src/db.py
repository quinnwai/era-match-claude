import sqlite3
from contextlib import contextmanager
from typing import Optional


def _dict_row(cursor, row):
    return {col[0]: row[i] for i, col in enumerate(cursor.description)}


@contextmanager
def _connect(db_path: str):
    conn = sqlite3.connect(db_path)
    conn.row_factory = _dict_row
    try:
        yield conn
    finally:
        conn.close()


def get_enriched_contacts(db_path: str) -> list[dict]:
    """Return contacts that have enrichment data (primary_expertise non-null)."""
    with _connect(db_path) as conn:
        return conn.execute("""
            SELECT c.contact_id, c.full_name, c.current_title, c.current_company,
                   c.seniority, c.persona_category, c.contact_type, c.linkedin_url,
                   r.primary_expertise, r.secondary_expertise, r.industry_verticals,
                   r.actively_advising_startups, r.open_to_outreach
            FROM contacts c
            JOIN person_research r ON c.contact_id = r.contact_id
            WHERE r.primary_expertise IS NOT NULL AND r.primary_expertise != ''
        """).fetchall()


def get_research_profiles_batch(db_path: str, contact_ids: list[int]) -> dict[int, dict]:
    """Return full research profiles for multiple contacts, keyed by contact_id."""
    if not contact_ids:
        return {}
    placeholders = ",".join("?" * len(contact_ids))
    with _connect(db_path) as conn:
        rows = conn.execute(f"""
            SELECT c.contact_id, c.full_name, c.current_title, c.current_company,
                   c.seniority, c.persona_category, c.contact_type, c.linkedin_url,
                   c.city, c.state, c.country,
                   r.*
            FROM contacts c
            JOIN person_research r ON c.contact_id = r.contact_id
            WHERE c.contact_id IN ({placeholders})
        """, contact_ids).fetchall()
    return {row["contact_id"]: row for row in rows}


def get_career_highlights_batch(db_path: str, contact_ids: list[int]) -> dict[int, list[dict]]:
    """Return career history for multiple contacts, keyed by contact_id."""
    if not contact_ids:
        return {}
    placeholders = ",".join("?" * len(contact_ids))
    with _connect(db_path) as conn:
        rows = conn.execute(f"""
            SELECT contact_id, title, organization_name, start_date, end_date, is_current
            FROM career_history
            WHERE contact_id IN ({placeholders})
            ORDER BY is_current DESC, start_date DESC
        """, contact_ids).fetchall()
    result: dict[int, list[dict]] = {}
    for row in rows:
        result.setdefault(row["contact_id"], []).append(row)
    return result


def get_research_profile(db_path: str, contact_id: int) -> Optional[dict]:
    """Return the full research profile for a single contact."""
    result = get_research_profiles_batch(db_path, [contact_id])
    return result.get(contact_id)


def get_career_highlights(db_path: str, contact_id: int) -> list[dict]:
    """Return career history for a single contact, most recent first."""
    result = get_career_highlights_batch(db_path, [contact_id])
    return result.get(contact_id, [])


def get_company_context(db_path: str, company_name: str) -> Optional[dict]:
    """Look up an ERA30 company by name (case-insensitive)."""
    with _connect(db_path) as conn:
        return conn.execute("""
            SELECT name, website, industry, funding_stage, one_liner, description
            FROM era30_companies
            WHERE LOWER(name) = LOWER(?)
        """, (company_name,)).fetchone()


def get_all_era30_companies(db_path: str) -> list[dict]:
    """Return all ERA30 companies."""
    with _connect(db_path) as conn:
        return conn.execute("""
            SELECT name, website, industry, funding_stage, one_liner, description
            FROM era30_companies
        """).fetchall()
