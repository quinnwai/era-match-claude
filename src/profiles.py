import random

from src.db import get_enriched_contacts, get_research_profiles_batch, get_career_highlights_batch


def _truncate(text: str, max_chars: int = 120) -> str:
    """Truncate text to max_chars, appending '...' if truncated."""
    if not text or len(text) <= max_chars:
        return text or ""
    return text[:max_chars].rstrip() + "..."


def compress_profile(contact: dict) -> str:
    """Compress a single enriched contact into a Stage 1 profile line."""
    name = contact.get("full_name", "Unknown")
    title = contact.get("current_title", "N/A")
    company = contact.get("current_company", "N/A")
    persona = contact.get("persona_category", "")

    header = f"[ID:{contact['contact_id']}] {name} | {title} @ {company} | {persona}"
    lines = [header]

    expertise = []
    if contact.get("primary_expertise"):
        expertise.append(_truncate(contact["primary_expertise"], 100))
    if contact.get("secondary_expertise"):
        expertise.append(_truncate(contact["secondary_expertise"], 80))
    if expertise:
        lines.append(f"  Exp: {'; '.join(expertise)}")

    if contact.get("industry_verticals"):
        lines.append(f"  Vert: {_truncate(contact['industry_verticals'], 80)}")

    advising = contact.get("actively_advising_startups", "unknown")
    outreach = contact.get("open_to_outreach", "unknown")
    lines.append(f"  Adv: {advising} | Out: {outreach}")

    return "\n".join(lines)


def get_compressed_profiles(db_path: str, shuffle: bool = True) -> str:
    """Build the full compressed profiles block for Stage 1.

    Shuffles order each call to mitigate positional bias in LLM attention.
    """
    contacts = get_enriched_contacts(db_path)
    if shuffle:
        contacts = list(contacts)
        random.shuffle(contacts)

    segments = []
    for i, contact in enumerate(contacts):
        if i > 0 and i % 100 == 0:
            segments.append(f"--- PROFILES {i+1}-{min(i+100, len(contacts))} ---")
        segments.append(compress_profile(contact))

    return "\n\n".join(segments)


def format_full_profile(profile: dict, career: list[dict]) -> str:
    """Format a full profile for Stage 2 ranking."""
    lines = [
        f"[ID:{profile['contact_id']}] {profile.get('full_name', 'Unknown')}",
        f"Title: {profile.get('current_title', 'N/A')} @ {profile.get('current_company', 'N/A')}",
        f"Type: {profile.get('contact_type', 'N/A')} | Persona: {profile.get('persona_category', 'N/A')} | Seniority: {profile.get('seniority', 'N/A')}",
    ]

    if profile.get("linkedin_url"):
        lines.append(f"LinkedIn: {profile['linkedin_url']}")

    location_parts = [p for p in [profile.get("city"), profile.get("state"), profile.get("country")] if p]
    if location_parts:
        lines.append(f"Location: {', '.join(location_parts)}")

    if profile.get("primary_expertise"):
        lines.append(f"Primary Expertise: {profile['primary_expertise']}")
    if profile.get("secondary_expertise"):
        lines.append(f"Secondary Expertise: {profile['secondary_expertise']}")
    if profile.get("industry_verticals"):
        lines.append(f"Industry Verticals: {profile['industry_verticals']}")
    if profile.get("functional_depth"):
        lines.append(f"Functional Depth: {profile['functional_depth']}")
    if profile.get("topics_discussed"):
        lines.append(f"Topics Discussed: {profile['topics_discussed']}")
    if profile.get("conversation_hooks"):
        lines.append(f"Conversation Hooks: {profile['conversation_hooks']}")
    if profile.get("companies_founded"):
        lines.append(f"Companies Founded: {profile['companies_founded']}")
    if profile.get("advisory_roles"):
        lines.append(f"Advisory Roles: {profile['advisory_roles']}")

    advising = profile.get("actively_advising_startups", "unknown")
    outreach = profile.get("open_to_outreach", "unknown")
    lines.append(f"Advising Startups: {advising} | Open to Outreach: {outreach}")

    if profile.get("engagement_style"):
        lines.append(f"Engagement Style: {profile['engagement_style']}")
    if profile.get("warm_intro_potential"):
        lines.append(f"Warm Intro Potential: {profile['warm_intro_potential']}")
    if profile.get("shared_affiliations"):
        lines.append(f"Shared Affiliations: {profile['shared_affiliations']}")

    if career:
        lines.append("Career History:")
        for job in career[:5]:  # Top 5 most recent
            current = " (current)" if job.get("is_current") else ""
            dates = f" ({job.get('start_date', '?')} - {job.get('end_date', 'present')})" if job.get("start_date") else ""
            lines.append(f"  - {job.get('title', 'N/A')} @ {job.get('organization_name', 'N/A')}{dates}{current}")

    return "\n".join(lines)


def get_full_profiles(db_path: str, contact_ids: list[int]) -> str:
    """Build full profiles for a list of contact IDs (Stage 2)."""
    if not contact_ids:
        return ""
    profiles_map = get_research_profiles_batch(db_path, contact_ids)
    career_map = get_career_highlights_batch(db_path, contact_ids)
    formatted = []
    for cid in contact_ids:
        profile = profiles_map.get(cid)
        if profile is None:
            continue
        career = career_map.get(cid, [])
        formatted.append(format_full_profile(profile, career))
    return "\n\n---\n\n".join(formatted)
