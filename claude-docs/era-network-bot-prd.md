# ERA Network Matching Bot - Product Requirements Document

## Problem

ERA accelerator cohort companies (ERA30) need to make asks of the ERA mentor and alumni network. Common asks include:

- Getting feedback from people with specific domain expertise
- Getting warm intros to people in specific roles or at specific companies
- Finding potential early users/customers for their product

Today, this is a manual process: scrolling through a spreadsheet with LinkedIn links and some tagging, trying to figure out who in the network is relevant. It's high-friction enough that founders likely underutilize the network.

## Users

**Primary user (v1):** ERA30 founders. They type a natural-language ask into a Slack bot and get back a shortlist of relevant people from the ERA network.

**Future users:** ERA program team (for brokering intros on behalf of companies), mentors/alumni themselves (to find each other).

## Data Assets

### ERA Network Database (~1,289 contacts)

- **685 ERA alumni**, **604 ERA mentors**
- ~86% enriched via Apollo (1,106 of 1,289)
- ~183 contacts have no enrichment (LinkedIn URL only)

**Structured fields per contact:**
- Name, email, LinkedIn URL, photo
- Current title, current company, seniority level (founder, c_suite, vp, director, partner, etc.)
- City, state, country
- Persona category (STARTUP_ECOSYSTEM, PE_VC_INVESTOR, C_SUITE, GTM_LEADER, CORP_DEV, INDUSTRY_EXPERT, etc.)
- Contact type (ERA_ALUMNI or ERA_MENTOR)

**Research profile (person_research table, 980 records, ~796 with primary_expertise):**
- Primary expertise, secondary expertise
- Industry verticals, functional depth
- Topics discussed, conversation hooks
- Companies founded (with outcomes), advisory roles
- Actively advising startups (yes/no/unknown)
- Open to outreach (yes/no/unknown)
- Engagement style (e.g., "hosts office hours, mentors at accelerators")
- Warm intro potential, shared affiliations

**Career history (10,334 records):**
- Full work history per contact: title, company, start/end dates, is_current flag

### ERA30 Cohort Companies (14 companies)

Each company has: name, website, industry, funding stage (all pre-seed), and a one-liner description. Industries span enterprise software, AI/marketing, healthtech, legaltech, fintech, retail/fashion, hospitality, geotech, and sales intelligence.

## Core Interaction Flow

```
Founder opens Slack bot
  |
  v
Bot identifies the founder (asks them to identify themselves or matches from Slack profile)
  |
  v
Founder types a natural-language ask
  (e.g., "I need feedback on our enterprise pricing model from someone
   who's sold to Fortune 500 procurement teams")
  |
  v
Bot assesses whether the ask is specific enough to produce a quality match
  |
  +--> If too vague: ask ONE targeted clarifying question before searching
  |
  +--> If specific enough: proceed to retrieval
  |
  v
Retrieval: narrow the full network (~1,300) down to ~20-30 candidates
  |
  v
Re-ranking: LLM evaluates candidates against the ask + founder's company context
  |
  v
Bot returns top 3 matches with explanations of why each person is relevant
  |
  v
Founder can refine ("actually more on the paid acquisition side")
or ask for more results
```

### On Clarifying Questions

The bot should ask a clarifying question when the ask is genuinely too vague to produce a quality match, but it should do so sparingly. The reasoning:

- First-touch quality matters. If a founder gets a bad match on their first interaction, they may never come back.
- But excessive clarifying questions add friction. A question back instead of results can feel like the tool isn't working.
- The threshold: if the LLM can reasonably differentiate between candidate profiles given the ask, proceed. If the ask is so broad that the top 3 would essentially be random (e.g., "know anyone useful?"), ask one targeted question.

This is an area to revisit with usage data. If match quality is consistently good without clarification, remove it. If vague asks produce poor engagement, make clarification more aggressive.

## Output Format

**3 results per ask** (soft default), each with:

- Person's name, current title, company
- LinkedIn URL
- 2-3 sentence explanation of why they're a strong match for this specific ask
- Any relevant conversation hooks or context for the outreach

**Edge cases:**
- If fewer than 3 strong matches exist, return fewer and say so explicitly
- Founder can ask for more results in a follow-up message

## Architecture

### The Core Retrieval Problem

We need to match a founder's natural-language ask against ~800 enriched contact profiles. The question is how to narrow down and rank candidates.

### Research: Who Else Solves This Problem?

The closest analogies to our problem are:

1. **Recruiting/talent matching** (Eightfold, PeopleGPT/Juicebox, Recruitly): These platforms match natural-language job descriptions against candidate profiles. They universally use a two-stage approach: embedding-based retrieval to get candidates, then a more expensive re-ranking step. Eightfold describes extracting "deep semantic embeddings from unstructured data" as stage 1, then adding "interpretable features from structured extraction" and performing "fast explainable inference of match scores." Recruitly uses Qdrant vector DB with OpenAI embeddings and Claude for re-ranking.

2. **Event networking/matchmaking** (Grip, Brella, b2match): These match attendees based on profiles and goals. They lean heavily on collaborative filtering (learning from interaction data like who clicks on whom). We don't have interaction data yet, so this approach doesn't apply at launch but becomes relevant once we track which matches founders actually pursue.

3. **Mentor matching** (MentorEase, Mentorloop, AcceleratorApp): These are closest to our exact use case but are surprisingly unsophisticated. Most use structured criteria matching (tags, categories, checkboxes). The accelerator-specific tools like AcceleratorApp just let you filter mentors by tags. This is essentially what ERA does today with spreadsheets.

**Key takeaway:** The recruiting world has converged on embeddings + LLM re-ranking as the standard pattern, but those systems operate at 100K-10M+ profiles. Our dataset is dramatically smaller.

### Size Analysis: Our Dataset Is Unusually Small

We measured the actual token footprint of the ERA network:

| Profile Format | Contacts | Total Tokens | Fits in 200K Context? |
|---|---|---|---|
| Full profiles (all research fields) | 796 | ~250K | No |
| Medium-compressed (expertise + verticals + topics) | 796 | ~97K | Yes |
| Compressed (name + title + company + expertise) | 796 | ~50K | Yes, easily |
| Minimal (structured fields only) | 1,106 | ~77K | Yes |

This changes the calculus. At ~800 enriched profiles, we have three viable approaches:

### Approach A: Embeddings + LLM Re-ranking (the "standard" pattern)

```
Ask --> Embed ask --> Vector search (top 20-30) --> LLM re-ranks --> Top 3
```

Pre-compute embeddings for all contact profiles. At query time, embed the ask, retrieve top 20-30 by cosine similarity, then send those to Claude for detailed ranking.

Pros:
- Well-understood pattern from recruiting industry
- Fast retrieval (milliseconds)
- Scales to any dataset size

Cons:
- Adds infrastructure (embedding model + vector store)
- Embedding quality determines the recall ceiling: if the embedding model doesn't understand that "enterprise sales" relates to "B2B GTM leader," the right person never reaches the LLM
- Requires choosing and potentially benchmarking an embedding model
- The profile text construction (what to embed) is a critical decision that's hard to get right without iteration

### Approach B: Compressed Context + Full Profile Re-rank (the "brute force" approach) **RECOMMENDED**

```
Ask --> LLM sees ALL compressed profiles (~50K tokens) --> Picks top 20-30 IDs
    --> LLM sees full profiles of those 20-30 --> Top 3 with explanations
```

Send every compressed profile to Claude in a single context window. The LLM reads all of them and identifies the most relevant candidates. Then send the full research profiles of those candidates for detailed evaluation and explanation.

Pros:
- No embedding model or vector store needed; dramatically simpler architecture
- LLM reasons about ALL candidates simultaneously, not just those an embedding model happens to surface
- Better at nuanced/ambiguous asks: the LLM can infer that "someone who understands procurement in industrial companies" should match against Aerium's domain, not just keyword-match
- Much easier to build, debug, and iterate on
- Profile "construction" is just formatting, not a high-stakes embedding decision
- Two API calls per query, both deterministic in structure

Cons:
- Higher per-query cost (~$0.15-0.30 for Stage 1 at Sonnet pricing)
- Won't scale past ~2,000 contacts without switching to Approach A
- Two sequential LLM calls adds ~5-10 seconds of latency

Cost at expected usage: 14 companies, ~5-10 queries/week = ~40 queries/month. At $0.30/query for the full two-stage flow, that's ~$12/month. Negligible.

### Approach C: Single LLM Call (simplest possible)

```
Ask --> LLM sees all medium-compressed profiles (~97K tokens) --> Top 3 with explanations
```

Everything in one call. Send medium-compressed profiles with enough detail for the LLM to both select AND explain matches.

Pros:
- Simplest possible architecture: one API call
- Lowest latency (one round-trip)

Cons:
- LLM may produce lower-quality explanations without full profile detail
- 97K tokens of context pushes the boundary; less room for system prompt, conversation history, etc.
- Harder to debug which stage went wrong (selection vs. explanation)

### Recommendation: Approach B

For an accelerator network of ~800 enriched contacts queried by 14 companies, the "brute force" two-stage LLM approach is the right call. Here's the reasoning:

1. **Match quality is the priority, not latency or cost.** Founders might use this a few times a week. A 10-second response time is fine. $12/month in API costs is irrelevant.
2. **Embeddings are designed for scale we don't have.** The entire recruiting industry uses embeddings because they need to search millions of profiles in milliseconds. We have 800.
3. **The LLM is strictly better at nuanced reasoning than cosine similarity.** When a founder asks "I need someone who's sold into large insurance companies and understands compliance," an LLM reading the full expertise descriptions will outperform an embedding that has to compress all that into a single vector.
4. **Simpler architecture = faster to build and easier to iterate.** No embedding model to choose, no vector DB to manage, no profile-to-embedding pipeline to tune.
5. **The migration path to Approach A is clean.** If the network grows past ~2,000 contacts, you add an embedding layer in front. The Stage 2 (LLM re-ranking) stays identical.

### Founder Identification

- **v1:** Ask the founder to state their name or company when they first interact
- **Nice-to-have:** Match Slack display name to era30_companies or a lightweight lookup table

### Clarification Logic

- Before retrieval, the LLM assesses whether the ask is specific enough
- If not, it generates ONE clarifying question
- This is a lightweight pre-processing step, not a separate pipeline

## Technical Decisions (for POC)

| Decision | Choice | Rationale |
|---|---|---|
| Interface | Slack bot | Where founders already are; low friction |
| LLM | Claude via Anthropic API (Sonnet for Stage 1 screening, Sonnet or Opus for Stage 2 ranking) | Strong reasoning for nuanced matching; prompt caching available for the compressed profiles |
| Retrieval | Brute-force LLM (Approach B) | Dataset small enough (~50K tokens compressed); better match quality than embeddings at this scale |
| Vector store | None needed for v1 | Eliminates infrastructure; add later if network exceeds ~2,000 contacts |
| Database | Existing SQLite (era_network_lite.db) | Already populated; no migration needed for POC |
| Hosting | TBD | Needs to run a web server for Slack events |
| Prompt caching | Recommended | The compressed profile block is static across queries; caching reduces Stage 1 cost by ~90% |

## Data Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Un-enriched contacts (183) | Exclude from v1 | No research data means they'll never match well; add as a future enrichment task |
| Profile construction (Stage 1) | Compressed: contact_id, name, title, company, primary_expertise, secondary_expertise, industry_verticals | Enough signal for LLM to identify candidates; keeps total under 50K tokens |
| Profile construction (Stage 2) | Full: all research fields + career history highlights | Give the LLM everything it needs for nuanced ranking and rich explanations |

## Open Questions

1. **Prompt design for Stage 1 screening** is the most consequential engineering decision. The system prompt needs to instruct Claude to read ~800 compressed profiles and reliably identify the best 20-30. This needs careful testing.
2. **Slack bot deployment** - Bolt (Python) is likely the fastest path. Socket mode avoids needing a public URL for development. Production needs a hosted server.
3. **Feedback loop** - How do we know if matches are good? Options: thumbs up/down reaction on the Slack message, track if the founder requests more results, or simply ask "was this helpful?"
4. **Prompt caching** - The compressed profiles block is identical across queries. Anthropic's prompt caching could reduce Stage 1 input costs by ~90%. Worth implementing from the start.
5. **Access control** - Any founder can query the full network (confirmed). Results should show name, title, company, LinkedIn URL, and match explanation. Emails should probably not be surfaced directly in v1; instead, route through ERA for warm intros.
6. **Conversation memory** - Should the bot remember previous asks within a Slack thread? This enables refinement ("actually more on the paid acquisition side") but adds complexity.
7. **Model selection** - Sonnet is likely sufficient for Stage 1 (pattern matching across profiles). Stage 2 may benefit from a stronger model for nuanced reasoning and explanation quality. Worth A/B testing.

## Success Criteria (POC)

- A founder can type a natural-language ask and get 3 relevant matches with explanations within ~10 seconds
- Matches feel meaningfully better than manual spreadsheet scanning
- The system correctly uses company context (e.g., a fintech founder gets different results than a healthtech founder for the same ask type)
- Architecture is extensible: adding new contacts, new data fields, or new ask types doesn't require a rewrite

---

## Agentic Implementation Plan

This section defines everything needed for an AI coding agent (e.g., Claude Code) to build the POC autonomously, including what the human must set up beforehand, how the agent should structure its work, and how it can test and iterate without human intervention.

### Human Prerequisites (do these BEFORE the agent starts)

**1. Anthropic API Key**
- Create an API key at console.anthropic.com
- Ensure it has access to Claude Sonnet (claude-sonnet-4-20250514)
- Store as environment variable: `ANTHROPIC_API_KEY`

**2. Slack App Setup**
- Go to api.slack.com/apps and create a new app ("ERA Network Bot")
- Enable **Socket Mode** (this avoids needing a public URL for development)
- Generate an **App-Level Token** with `connections:write` scope. Store as: `SLACK_APP_TOKEN`
- Under OAuth & Permissions, add these **Bot Token Scopes:**
  - `app_mentions:read` (to respond when @mentioned)
  - `chat:write` (to send messages)
  - `im:history` (to read DMs)
  - `im:read`
  - `im:write`
- Install the app to the workspace and copy the **Bot User OAuth Token**. Store as: `SLACK_BOT_TOKEN`
- Under Event Subscriptions (Socket Mode), subscribe to:
  - `app_mention`
  - `message.im`
- Invite the bot to a test channel

**3. Environment File**
Create a `.env` file with:
```
ANTHROPIC_API_KEY=sk-ant-...
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
```

**4. Database**
Place `era_network_lite.db` in the project root. The agent will read from it directly.

**5. Test Channel**
Create a `#bot-testing` channel in the Slack workspace and invite the bot. This is where the human can manually test after the agent has validated the pipeline programmatically.

### Project Structure

The agent should create this structure:

```
era-network-bot/
  .env                          # Human creates this
  era_network_lite.db           # Human places this
  requirements.txt              # Agent creates
  
  src/
    config.py                   # Env vars, constants
    db.py                       # Database access layer
    profiles.py                 # Profile compression and formatting
    matching.py                 # Stage 1 + Stage 2 matching pipeline
    prompts.py                  # All LLM prompts (isolated for iteration)
    slack_bot.py                # Slack bot interface (thin layer)
  
  tests/
    test_profiles.py            # Unit tests: profile compression, formatting
    test_matching_pipeline.py   # Integration tests: full pipeline without Slack
    test_evaluation.py          # Evaluation harness: LLM-as-judge
    test_fixtures.py            # Test asks and evaluation criteria
  
  scripts/
    run_evaluation.py           # Runs full eval suite, outputs scores
    run_slack_bot.py            # Entry point for Slack bot
    inspect_profiles.py         # Debug tool: view compressed profiles
```

**Key design principle:** The matching pipeline (`matching.py`) must be fully testable without Slack. Slack is just a thin I/O layer on top.

### Component Interfaces

The agent should build to these interfaces so components are independently testable:

```python
# profiles.py
def get_compressed_profiles(db_path: str) -> str:
    """Returns the full compressed profiles block for Stage 1.
    This string is cached and reused across queries."""

def get_full_profiles(db_path: str, contact_ids: list[int]) -> str:
    """Returns full research profiles for specific contacts (Stage 2)."""

# matching.py  
def assess_ask_clarity(ask: str, company_context: str) -> dict:
    """Returns {clear: bool, clarifying_question: str | None}"""

def stage1_screen(ask: str, company_context: str, compressed_profiles: str) -> list[int]:
    """Returns list of ~20-30 contact_ids from compressed profiles."""

def stage2_rank(ask: str, company_context: str, full_profiles: str) -> list[dict]:
    """Returns top 3 matches, each with: contact_id, name, title, 
    company, linkedin_url, explanation, conversation_hooks."""

def run_matching_pipeline(ask: str, company_name: str, db_path: str) -> dict:
    """Full pipeline: clarity check -> stage1 -> stage2 -> formatted results.
    This is what Slack calls."""

# prompts.py
STAGE1_SYSTEM_PROMPT = "..."    # Screening prompt
STAGE2_SYSTEM_PROMPT = "..."    # Ranking + explanation prompt
CLARITY_SYSTEM_PROMPT = "..."   # Ask assessment prompt
```

### Test Harness Design (How the Agent Tests Autonomously)

This is the critical piece. The agent needs three levels of testing it can run without human feedback:

**Level 1: Structural Tests (unit tests, no LLM calls)**
- Profile compression produces valid output for all 796 contacts
- Compressed profiles fit under 60K tokens
- Full profile retrieval works for any valid contact_id
- Company context lookup works for all 14 ERA30 companies
- Output format matches expected schema

**Level 2: Pipeline Integration Tests (LLM calls, deterministic evaluation)**
- Run a set of test asks through the full pipeline
- Verify structural properties of results:
  - Returns exactly 3 results (or fewer with explanation)
  - Each result has all required fields (name, title, company, linkedin_url, explanation)
  - contact_ids in results exist in the database
  - Explanations are non-empty and reference the ask
  - No duplicate contacts in results
  - Response time under 15 seconds

**Level 3: Match Quality Evaluation (LLM-as-judge)**

This is how the agent iterates on prompt quality without a human. The approach:

1. Define test fixtures: pairs of (ask + company context) with evaluation criteria
2. Run each ask through the pipeline
3. Use a separate LLM call (the "judge") to score the results against the criteria
4. Aggregate scores and identify weak spots
5. Iterate on prompts and re-run

### Test Fixtures

The agent should use these test cases. Each has an ask, a company context, and criteria the judge should evaluate against.

```python
TEST_CASES = [
    {
        "id": "fintech_credit_feedback",
        "ask": "I need someone who understands institutional credit research and can give feedback on our product approach",
        "company": "Passu",  # AI for corporate credit research
        "criteria": [
            "Results should include people with financial services or credit backgrounds",
            "At least one result should have direct experience in institutional finance or credit",
            "Results should NOT be dominated by pure VC investors with no domain expertise",
            "Explanations should reference the person's relevant financial/credit experience"
        ]
    },
    {
        "id": "legaltech_warm_intro",
        "ask": "Can you find me someone who could make a warm intro to general counsel or legal ops leaders at large companies?",
        "company": "Discernis",  # Legal intelligence software
        "criteria": [
            "Results should include people with legal industry connections",
            "Priority should go to people with warm intro potential or strong networks",
            "At least one result should have direct legal industry experience",
            "Explanations should address the intro pathway, not just domain expertise"
        ]
    },
    {
        "id": "marketing_user_testing",
        "ask": "We're looking for marketing leaders at consumer brands who might want to try our product",
        "company": "Astute Labs",  # Autonomous marketing agents
        "criteria": [
            "Results should include people in marketing roles or with marketing expertise",
            "Consumer brand experience should be weighted heavily",
            "People who are actively advising startups should be preferred",
            "Explanations should address why they'd be interested as a potential user"
        ]
    },
    {
        "id": "hospitality_industry_expert",
        "ask": "I need someone with deep hospitality industry knowledge who can help us understand hotel operations",
        "company": "MadeOnSite",  # Hotel operations hardware
        "criteria": [
            "Results should include people with hospitality or hotel industry experience",
            "If no direct hospitality matches exist, results should acknowledge this gap",
            "Results should NOT return generic startup advisors with no industry relevance",
            "The system should handle a niche industry query gracefully"
        ]
    },
    {
        "id": "vague_ask",
        "ask": "know anyone who could help us?",
        "company": "Kandir",  # Sales intelligence
        "criteria": [
            "The system should ask a clarifying question rather than return random results",
            "If it does return results, they should at least be relevant to Kandir's domain (sales, enterprise)",
            "The response should indicate the ask is too broad"
        ]
    },
    {
        "id": "enterprise_sales",
        "ask": "I need advice on our enterprise sales motion. We're selling to Fortune 500 procurement teams and struggling with long sales cycles.",
        "company": "Aerium",  # Procurement intelligence for industrial companies
        "criteria": [
            "Results should include people with enterprise sales or GTM leadership experience",
            "Procurement or supply chain domain expertise should be weighted",
            "Seniority should be VP/Director/C-suite level, not entry-level",
            "Explanations should connect the person's experience to enterprise sales challenges"
        ]
    },
    {
        "id": "fundraising",
        "ask": "We're about to start raising our seed round. Who should I talk to?",
        "company": "Philter",  # Portfolio intelligence for private market LPs
        "criteria": [
            "Results should include VCs or investors who invest at seed stage",
            "Fintech or financial services focused investors should be preferred",
            "People who are actively advising startups or open to outreach should rank higher",
            "Explanations should note their investment focus and stage preference"
        ]
    },
    {
        "id": "technical_feedback",
        "ask": "Looking for someone technical who has experience building 3D visualization or geospatial systems",
        "company": "Cascade Geomatics",  # Terrain intelligence, 3D digital twins
        "criteria": [
            "Results should include people with technical/engineering backgrounds",
            "Geospatial, mapping, or 3D/visualization experience should be strongly preferred",
            "If few direct matches exist, adjacent technical domains are acceptable",
            "Results should NOT be dominated by non-technical investors or advisors"
        ]
    }
]
```

### LLM-as-Judge Evaluation

The agent should implement this evaluation loop:

```python
def evaluate_results(test_case: dict, pipeline_results: dict) -> dict:
    """
    Uses Claude to judge whether pipeline results meet the test case criteria.
    
    Returns:
        {
            "test_id": str,
            "criteria_scores": [
                {"criterion": str, "pass": bool, "reasoning": str}
            ],
            "overall_score": float,  # 0.0 to 1.0
            "suggestions": str  # What could be improved
        }
    """
    # Build a judge prompt that shows the test case, criteria, 
    # and actual results, and asks the judge to evaluate each criterion
```

The judge should be a different model call than the pipeline itself (to avoid self-evaluation bias). If using Sonnet for the pipeline, use Sonnet with a clearly separated judge prompt. The judge prompt should:
- Show the original ask and company context
- Show the 3 returned results with their explanations
- List each evaluation criterion
- Ask for a pass/fail on each criterion with reasoning
- Ask for an overall score and improvement suggestions

**Target: 75%+ criteria pass rate across all test cases before moving to Slack integration.**

### Agent Workflow

The agent should work in this order:

```
Phase 1: Foundation (no LLM calls needed)
  1. Set up project structure and requirements.txt
  2. Build db.py - database access layer
  3. Build profiles.py - profile compression
  4. Build config.py - env vars and constants
  5. Run Level 1 structural tests
  
Phase 2: Matching Pipeline (LLM calls, no Slack)
  6. Build prompts.py - first draft of all prompts
  7. Build matching.py - full pipeline
  8. Build test fixtures and evaluation harness
  9. Run Level 2 integration tests
  10. Run Level 3 LLM-as-judge evaluation
  11. ITERATE on prompts until 75%+ criteria pass rate
      - This is the core feedback loop
      - Agent should log each iteration's scores
      - Agent should make targeted prompt changes based on judge feedback
  
Phase 3: Slack Integration (requires human's Slack setup)
  12. Build slack_bot.py - thin wrapper around matching pipeline
  13. Manual testing in #bot-testing channel (human does this)
  
Phase 4: Polish
  14. Add error handling (API failures, empty results, rate limits)
  15. Add conversation thread support for follow-up asks
  16. Add logging for monitoring query patterns
```

**The agent can complete Phases 1-2 entirely autonomously.** Phase 3 requires the human to have completed the Slack setup prerequisites. Phase 4 is iterative.

### What the Agent CANNOT Do

- Create the Slack app or generate tokens (human must do this)
- Deploy to production (human decides hosting)
- Evaluate subjective match quality beyond the LLM-as-judge framework (human should review a sample)
- Add new contacts to the database
- Test with real founders (human arranges this)

### Prompt Iteration Strategy

When the LLM-as-judge identifies failures, the agent should follow this decision tree:

1. **Wrong domain/industry matches** -> Adjust Stage 1 prompt to emphasize industry alignment with the asking company's domain
2. **Wrong seniority level** -> Add seniority weighting instructions to Stage 1
3. **Generic explanations** -> Adjust Stage 2 prompt to require specific references to the person's experience
4. **Too many VC investors when domain expertise is needed** -> Add instruction to distinguish between "investor in this space" vs. "practitioner in this space"
5. **Fails to ask clarifying question on vague asks** -> Adjust clarity assessment threshold
6. **Returns people not actively advising** -> Add weighting for `actively_advising_startups` and `open_to_outreach` fields

### Environment and Dependencies

```
# requirements.txt
anthropic>=0.40.0
slack-bolt>=1.20.0
slack-sdk>=3.30.0
python-dotenv>=1.0.0
pytest>=8.0.0
```

No embedding libraries. No vector databases. No ML dependencies.
