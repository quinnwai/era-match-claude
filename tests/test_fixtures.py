TEST_CASES = [
    {
        "id": "fintech_credit_feedback",
        "ask": "I need someone who understands institutional credit research and can give feedback on our product approach",
        "company": "Passu",
        "criteria": [
            "Results should include people with financial services or credit backgrounds",
            "At least one result should have direct experience in institutional finance or credit",
            "Results should NOT be dominated by pure VC investors with no domain expertise",
            "Explanations should reference the person's relevant financial/credit experience",
        ],
    },
    {
        "id": "legaltech_warm_intro",
        "ask": "Can you find me someone who could make a warm intro to general counsel or legal ops leaders at large companies?",
        "company": "Discernis",
        "criteria": [
            "Results should include people with legal industry connections",
            "Priority should go to people with warm intro potential or strong networks",
            "At least one result should have direct legal industry experience",
            "Explanations should address the intro pathway, not just domain expertise",
        ],
    },
    {
        "id": "marketing_user_testing",
        "ask": "We're looking for marketing leaders at consumer brands who might want to try our product",
        "company": "Astute Labs",
        "criteria": [
            "Results should include people in marketing roles or with marketing expertise",
            "Consumer brand experience should be weighted heavily",
            "People who are actively advising startups should be preferred",
            "Explanations should address why they'd be interested as a potential user",
        ],
    },
    {
        "id": "hospitality_industry_expert",
        "ask": "I need someone with deep hospitality industry knowledge who can help us understand hotel operations",
        "company": "MadeOnSite",
        "criteria": [
            "Results should include people with hospitality or hotel industry experience",
            "If no direct hospitality matches exist, results should acknowledge this gap",
            "Results should NOT return generic startup advisors with no industry relevance",
            "The system should handle a niche industry query gracefully",
        ],
    },
    {
        "id": "vague_ask",
        "ask": "know anyone who could help us?",
        "company": "Kandir",
        "criteria": [
            "The system should ask a clarifying question rather than return random results",
            "If it does return results, they should at least be relevant to Kandir's domain (sales, enterprise)",
            "The response should indicate the ask is too broad",
        ],
    },
    {
        "id": "enterprise_sales",
        "ask": "I need advice on our enterprise sales motion. We're selling to Fortune 500 procurement teams and struggling with long sales cycles.",
        "company": "Aerium",
        "criteria": [
            "Results should include people with enterprise sales or GTM leadership experience",
            "Procurement or supply chain domain expertise should be weighted",
            "Seniority should be VP/Director/C-suite level, not entry-level",
            "Explanations should connect the person's experience to enterprise sales challenges",
        ],
    },
    {
        "id": "fundraising",
        "ask": "We're about to start raising our seed round. Who should I talk to?",
        "company": "Philter",
        "criteria": [
            "Results should include VCs or investors who invest at seed stage",
            "Fintech or financial services focused investors should be preferred",
            "People who are actively advising startups or open to outreach should rank higher",
            "Explanations should note their investment focus and stage preference",
        ],
    },
    {
        "id": "technical_feedback",
        "ask": "Looking for someone technical who has experience building 3D visualization or geospatial systems",
        "company": "Cascade Geomatics",
        "criteria": [
            "Results should include people with technical/engineering backgrounds",
            "Geospatial, mapping, or 3D/visualization experience should be strongly preferred",
            "If few direct matches exist, adjacent technical domains are acceptable",
            "Results should NOT be dominated by non-technical investors or advisors",
        ],
    },
]
