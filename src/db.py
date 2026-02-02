import sqlite3
from contextlib import closing
from typing import Optional


def _dict_row(cursor, row):
    return {col[0]: row[i] for i, col in enumerate(cursor.description)}


def _connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = _dict_row
    return conn


def get_enriched_contacts(db_path: str) -> list[dict]:
    """Return contacts that have enrichment data (primary_expertise non-null)."""
    with closing(_connect(db_path)) as conn:
        return conn.execute("""
            SELECT c.contact_id, c.full_name, c.current_title, c.current_company,
                   c.seniority, c.persona_category, c.contact_type, c.linkedin_url,
                   r.primary_expertise, r.secondary_expertise, r.industry_verticals,
                   r.actively_advising_startups, r.open_to_outreach
            FROM contacts c
            JOIN person_research r ON c.contact_id = r.contact_id
            WHERE r.primary_expertise IS NOT NULL AND r.primary_expertise != ''
        """).fetchall()


def get_research_profile(db_path: str, contact_id: int) -> Optional[dict]:
    """Return the full research profile for a contact."""
    with closing(_connect(db_path)) as conn:
        return conn.execute("""
            SELECT c.contact_id, c.full_name, c.current_title, c.current_company,
                   c.seniority, c.persona_category, c.contact_type, c.linkedin_url,
                   c.city, c.state, c.country,
                   r.*
            FROM contacts c
            JOIN person_research r ON c.contact_id = r.contact_id
            WHERE c.contact_id = ?
        """, (contact_id,)).fetchone()


def get_career_highlights(db_path: str, contact_id: int) -> list[dict]:
    """Return career history for a contact, most recent first."""
    with closing(_connect(db_path)) as conn:
        return conn.execute("""
            SELECT title, organization_name, start_date, end_date, is_current
            FROM career_history
            WHERE contact_id = ?
            ORDER BY is_current DESC, start_date DESC
        """, (contact_id,)).fetchall()


def get_company_context(db_path: str, company_name: str) -> Optional[dict]:
    """Look up an ERA30 company by name (case-insensitive)."""
    with closing(_connect(db_path)) as conn:
        return conn.execute("""
            SELECT name, website, industry, funding_stage, one_liner, description
            FROM era30_companies
            WHERE LOWER(name) = LOWER(?)
        """, (company_name,)).fetchone()


def get_all_era30_companies(db_path: str) -> list[dict]:
    """Return all ERA30 companies."""
    with closing(_connect(db_path)) as conn:
        return conn.execute("""
            SELECT name, website, industry, funding_stage, one_liner, description
            FROM era30_companies
        """).fetchall()
