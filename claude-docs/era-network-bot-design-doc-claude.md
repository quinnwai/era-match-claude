# ERA Network Matching Bot: Engineering Design Document

**Status:** Draft
**Author:** [TBD]
**Last Updated:** 2026-02-01
**Target Audience:** Engineers and AI coding agents implementing the POC

---

## 1. System Overview

The ERA Network Matching Bot is a Slack-based tool that lets ERA30 cohort founders (14 pre-seed companies) query a network of ~1,289 contacts (685 alumni, 604 mentors) using natural language. A founder types an ask like "I need someone who understands institutional credit research" and the bot returns the 3 best-matched people with explanations of why they're relevant.

The matching pipeline uses a two-stage LLM approach (no embeddings, no vector store) that fits the entire compressed network into a single Claude context window. This works because the dataset is unusually small: ~800 enriched profiles fit into ~50K tokens when compressed.

### Why This Approach

The recruiting industry has converged on embeddings + LLM re-ranking, but those systems serve 100K-10M+ profiles. At ~800 profiles, embeddings add infrastructure complexity without meaningful benefit. An LLM reading all profiles simultaneously is strictly better at nuanced reasoning than cosine similarity over compressed vectors. The migration path to embeddings is clean if the network grows past ~2,000 contacts.

### Cost and Latency

At 14 companies making ~5-10 queries/week (~40/month), the two-stage pipeline costs roughly $0.15-0.30 per query, or ~$12/month total. Latency is 5-10 seconds (two sequential LLM calls), which is acceptable for this use case.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Slack (DM or @mention in channel)                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Founder types: "I need someone who understands       │  │
│  │  enterprise procurement in industrial companies"      │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Slack Bot (slack_bot.py) - thin I/O layer                  │
│  - Identifies founder (name/company lookup)                 │
│  - Passes ask + company context to matching pipeline        │
│  - Formats results as Block Kit message                     │
│  - Handles threading for follow-ups                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Matching Pipeline (matching.py)                            │
│                                                             │
│  Step 0: Clarity Check                                      │
│  - Is the ask specific enough? If not, return one           │
│    clarifying question.                                     │
│                                                             │
│  Step 1: Screening (Stage 1)                                │
│  - Input: ~50K tokens of compressed profiles + ask          │
│  - Model: Claude Sonnet                                     │
│  - Output: structured list of 20-30 contact_ids             │
│  - Uses prompt caching for the static profile block         │
│                                                             │
│  Step 2: Ranking (Stage 2)                                  │
│  - Input: full profiles of 20-30 candidates + ask           │
│  - Model: Claude Sonnet (or Opus for quality)               │
│  - Output: top 3 matches with explanations                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Data Layer (db.py, profiles.py)                            │
│  - SQLite: era_network_lite.db                              │
│  - Tables: contacts, person_research, career_history,       │
│    era30_companies                                          │
│  - Profile compression for Stage 1                          │
│  - Full profile assembly for Stage 2                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Research Deep Dive: Stage 1 Prompt Design

Stage 1 is the most unusual engineering task in this system. We're asking Claude to read ~800 compressed profiles in a single call and return a structured list of the best 20-30 candidates. This section covers what we learned from research and what it means for our design.

### 3.1 The "Lost in the Middle" Problem

Research on LLMs processing long contexts has identified a consistent pattern called "lost in the middle." LLMs exhibit a U-shaped attention curve: they attend most strongly to tokens at the beginning and end of their input, and performance degrades for information positioned in the middle.

This was first characterized in the paper "Lost in the Middle: How Language Models Use Long Contexts" (Liu et al., 2023), which showed that retrieval accuracy drops significantly when the relevant information sits in the middle of the context. MIT researchers later traced this to causal masking in transformer architectures, which inherently biases the model toward earlier tokens, with the bias amplifying across layers. Rotary Position Embedding (RoPE) introduces a long-term decay effect that compounds this.

**What this means for us:**

With ~800 profiles in a 50K-token block, the profiles in the middle of the list are at risk of being systematically under-attended. A great match at position 400 might get overlooked while weaker matches near the top or bottom get selected.

**Mitigations we should implement:**

1. **Randomize profile order per query.** Shuffle the compressed profiles on each request so that positional bias doesn't consistently penalize the same people. This is the simplest and most effective defense. Over multiple queries, every contact gets equal exposure to the high-attention positions.

2. **Group profiles by category, then shuffle within groups.** If the ask is about "enterprise sales," profiles tagged with GTM-related personas can be placed at the beginning and end of the list, with less-likely matches in the middle. This exploits the U-shaped bias rather than fighting it. However, this adds complexity and risks circular reasoning (pre-filtering before the LLM), so start with pure randomization and only add strategic ordering if evaluation shows quality issues.

3. **Use explicit instructions to counteract bias.** Include a directive in the system prompt: "Evaluate every profile in this list with equal attention. Relevant candidates may appear anywhere in the list, not just at the beginning or end. Read the entire list before making selections."

4. **Break the list into segments with mini-summaries.** Insert periodic markers like `--- PROFILES 201-300 ---` so the model treats the list as multiple smaller chunks rather than one monolithic block.

### 3.2 Listwise vs. Pointwise vs. Pairwise Ranking

The LLM ranking literature identifies three main paradigms for using LLMs to rank items:

**Pointwise:** Evaluate each item independently (e.g., "rate this profile's relevance 1-10"). Requires calibrated scores and N separate calls. Not practical for 800 profiles.

**Pairwise:** Compare items in pairs (e.g., "which of these two profiles is more relevant?"). Produces the best ranking quality but requires O(N^2) comparisons. Completely impractical at our scale.

**Listwise:** Present the entire list and ask for a ranked output. This is what we're doing. Research shows listwise ranking works well with capable models (GPT-4 class), but degrades with smaller models and is sensitive to position bias and list length.

**Our approach is listwise screening, not listwise ranking.** We're not asking Claude to rank all 800 profiles. We're asking it to read 800 profiles and select the top 20-30 that are relevant. This is a fundamentally easier task because:

- Selection is binary (relevant vs. not), which is cognitively simpler than ordinal ranking
- We only need recall at the top, not a full ordering
- The Stage 2 re-rank handles the hard part (fine-grained ranking of 20-30 candidates)

**Prompt design implication:** The Stage 1 prompt should frame the task as "selection" not "ranking." Ask Claude to identify candidates that could plausibly match the ask, erring on the side of inclusion. Precision isn't critical here because Stage 2 will filter further; what matters is recall.

### 3.3 Recommended Stage 1 Prompt Structure

Based on the research, here's the recommended prompt structure:

```
System prompt:
  [Role and task framing]
  [Company context for the asking founder]
  [Instructions on what "relevant" means]
  [Output format specification]
  [Anti-bias instructions]

User message:
  [The compressed profiles block -- CACHED]
  [The founder's ask]
```

Key principles:

- **Put the profiles in the user message, not the system prompt.** This allows the ask to come after the profiles, so the model reads profiles with the ask fresh in working memory. However, see Section 5 on prompt caching -- caching works by caching a prefix, so the profiles should come before the variable ask.

- **Use XML tags for structure.** Wrap the profiles block in `<profiles>...</profiles>` and the ask in `<ask>...</ask>`. Claude handles XML-delimited structured data well.

- **Request a specific output format.** Ask for a JSON array of contact IDs with brief relevance notes. See Section 4 for how to enforce this with structured outputs.

- **Set the selection count explicitly.** "Select between 15 and 30 candidates" gives Claude a target range that balances recall with noise.

### 3.4 Iterative Refinement via Evaluation

The prompt design is the single highest-leverage piece of engineering in this project. Expect to iterate on it multiple times. The test harness (Section 8) provides an automated feedback loop: run test cases, score results with an LLM judge, identify failure modes, adjust the prompt, repeat.

Common failure modes to watch for:
- **VC-investor bias:** The network has many investors. Generic asks may return mostly VCs even when domain practitioners would be better matches. Add explicit instructions to distinguish "invested in this space" from "worked in this space."
- **Seniority mismatch:** Returning junior contacts when the ask implies senior expertise (or vice versa).
- **Industry drift:** Returning people from adjacent but wrong industries (e.g., fintech people for a healthtech ask).
- **Over-indexing on keywords:** Matching on surface-level keyword overlap rather than deeper expertise alignment.

---

## 4. Research Deep Dive: Structured Output from Claude

Stage 1 must return a clean list of contact IDs, not prose. Stage 2 must return structured match objects. Here's how to ensure reliable structured output.

### 4.1 Anthropic's Structured Outputs API (Recommended)

Anthropic released a structured outputs feature (public beta, November 2025) that provides guaranteed JSON schema compliance through constrained decoding. Rather than hoping the model follows instructions, the API compiles your JSON schema into a grammar and restricts token generation at inference time.

**How it works:**

1. Define a JSON schema (or use Pydantic/Zod to generate one)
2. Pass it as `output_format` in your API request
3. Include the beta header: `anthropic-beta: structured-outputs-2025-11-13`
4. The response in `response.content[0].text` is guaranteed-valid JSON matching your schema

**Supported models:** Claude Sonnet 4.5, Opus 4.1, Opus 4.5, Haiku 4.5.

**Example for Stage 1:**

```python
from pydantic import BaseModel

class Stage1Result(BaseModel):
    selected_contact_ids: list[int]
    reasoning_summary: str  # Brief note on overall approach

message = client.messages.create(
    model="claude-sonnet-4-5-20250929",
    max_tokens=4096,
    system=[{
        "type": "text",
        "text": STAGE1_SYSTEM_PROMPT
    }],
    messages=[{
        "role": "user",
        "content": f"<profiles>{compressed_profiles}</profiles>\n\n<ask>{founder_ask}</ask>"
    }],
    output_format={
        "type": "json_schema",
        "json_schema": {
            "name": "stage1_screening",
            "schema": Stage1Result.model_json_schema()
        }
    },
    headers={"anthropic-beta": "structured-outputs-2025-11-13"}
)

result = Stage1Result.model_validate_json(message.content[0].text)
```

**Example for Stage 2:**

```python
class MatchExplanation(BaseModel):
    contact_id: int
    name: str
    title: str
    company: str
    linkedin_url: str
    explanation: str          # 2-3 sentences on why they match
    conversation_hooks: str   # Suggested talking points for outreach

class Stage2Result(BaseModel):
    matches: list[MatchExplanation]
    notes: str  # Any caveats (e.g., "limited matches in this niche")
```

### 4.2 Fallback: Tool-Use-Based Structured Output

If structured outputs are unavailable (e.g., model compatibility issues), the established fallback is to use tool calling. Define a tool whose input schema matches your desired output, then force Claude to "call" that tool. The tool call parameters will conform to the schema.

```python
tools = [{
    "name": "report_matches",
    "description": "Report the selected candidate matches",
    "input_schema": Stage1Result.model_json_schema()
}]

message = client.messages.create(
    model="claude-sonnet-4-5-20250929",
    max_tokens=4096,
    tools=tools,
    tool_choice={"type": "tool", "name": "report_matches"},
    # ... rest of params
)

# Extract from tool_use content block
tool_input = message.content[0].input  # Already parsed dict
```

This approach is slightly less clean (it's a workaround rather than a first-class feature) but is widely used in production and very reliable.

### 4.3 Fallback: Prompt-Based JSON with Validation

If neither structured outputs nor tool use is appropriate, prompt engineering can work with validation:

1. Include explicit JSON schema in the system prompt
2. Prefill the assistant response with `[` or `{` to skip preamble
3. Parse with `json.loads()` in a try/except
4. Retry once on failure (should be rare with Claude Sonnet+)

**Recommendation:** Use structured outputs (4.1) as the primary approach. It eliminates an entire class of parsing bugs. Fall back to tool use (4.2) only if you hit model compatibility issues.

### 4.4 Key Constraints

- Structured outputs are incompatible with message prefilling
- No recursive schemas (keep nesting shallow)
- Use `additionalProperties: false` for strict validation
- Set generous `max_tokens` -- truncated responses won't match the schema
- Monitor `stop_reason` to catch truncations and refusals
- Schema overhead adds 50-200 tokens depending on complexity

---

## 5. Research Deep Dive: Prompt Caching

The compressed profiles block (~50K tokens) is identical across every query. Without caching, every query re-processes this block at full input token cost. Prompt caching reduces the cost of this repeated prefix by ~90%.

### 5.1 How It Works

Anthropic's prompt caching operates on prefixes. The API processes messages in order: `tools` -> `system` -> `messages`. You mark a content block with `cache_control: {"type": "ephemeral"}` and the system caches everything from the start of the prompt up to and including that block.

On the next request, if the prefix is byte-for-byte identical up to the cache breakpoint, the cached version is used. The cache has a 5-minute TTL that refreshes on each hit (a 1-hour TTL is also available at higher write cost).

**Critical detail: exact matching.** The cache requires 100% identical content up to the breakpoint. Any change to the system prompt, the profiles block, or anything before the cache breakpoint invalidates the cache.

### 5.2 Implementation for Our Pipeline

The optimal structure places the static content (system prompt + profiles) before the variable content (the founder's ask):

```python
message = client.messages.create(
    model="claude-sonnet-4-5-20250929",
    max_tokens=4096,
    system=[
        {
            "type": "text",
            "text": STAGE1_SYSTEM_PROMPT  # Static instructions
        },
        {
            "type": "text",
            "text": compressed_profiles_block,  # ~50K tokens, static
            "cache_control": {"type": "ephemeral"}
        }
    ],
    messages=[
        {
            "role": "user",
            "content": f"<company_context>{company_context}</company_context>\n\n<ask>{ask}</ask>"
        }
    ]
)
```

**Why put profiles in the system prompt, not the user message:** Caching works on prefixes. If the profiles are in the system prompt and the variable ask is in the user message, the entire system prompt (instructions + profiles) gets cached. If instead you put profiles in the user message, you'd need the ask to come after the profiles in the same message, and since the ask changes each time, the cache would never hit.

**Note:** This contradicts the guidance in Section 3.3 about putting profiles in the user message. For caching to work, profiles must be in the system prompt. The tradeoff is that the model reads the profiles before seeing the ask, but this is acceptable because:
- The system prompt includes clear framing ("you will receive an ask and must select matching candidates")
- Claude's long-context capabilities handle this ordering well
- The cost savings (~90% reduction) justify the architectural choice

### 5.3 Pricing Math

Using Claude Sonnet 4.5 at $3/MTok base input:

| Scenario | Input Tokens | Cost per Query |
|---|---|---|
| No caching | ~52K (profiles + prompt + ask) | ~$0.156 |
| First query (cache write) | ~52K at 1.25x | ~$0.195 |
| Subsequent queries (cache hit) | ~50K at 0.1x + ~2K at 1x | ~$0.021 |

At 40 queries/month, almost all will be cache hits. Monthly Stage 1 cost drops from ~$6.24 to ~$1.04. Stage 2 costs are not cacheable (different candidate sets each time) but are small (~5-10K tokens per query).

### 5.4 Cache Invalidation

The cache invalidates when:
- The system prompt text changes (any edit, even whitespace)
- The profiles block content changes (new contacts, updated data)
- 5 minutes pass without a cache hit (TTL expiry)

**For our use case:** The profiles change only when the database is updated (rare). The system prompt changes only when prompts are being iterated on. During normal operation, the cache will be warm for the entire workday as long as queries happen at least every 5 minutes. If query frequency is lower, consider the 1-hour TTL option ($6/MTok write cost instead of $3.75/MTok, but the same $0.30/MTok read cost).

### 5.5 Monitoring Cache Performance

The API response includes cache metrics in the `usage` field:

```json
{
    "cache_creation_input_tokens": 0,      // 0 = cache hit
    "cache_read_input_tokens": 51234,      // Tokens read from cache
    "input_tokens": 1856,                   // Non-cached input tokens
    "output_tokens": 523
}
```

Log these values to track cache hit rate. Target: >90% cache hit rate during business hours.

---

## 6. Research Deep Dive: Slack Bolt Integration

### 6.1 Framework Choice

Slack Bolt for Python is the official framework for building Slack apps. It handles OAuth, event verification, token rotation, and rate limiting. Use Socket Mode for development (no public URL needed) and switch to HTTP mode for production deployment.

### 6.2 App Setup and Event Handling

The bot responds to two event types:

- `message.im`: Direct messages to the bot
- `app_mention`: @mentions in channels

```python
from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler

app = App(token=os.environ["SLACK_BOT_TOKEN"])

@app.event("message")
def handle_dm(event, say, client):
    """Handle direct messages."""
    if event.get("channel_type") == "im":
        process_ask(event, say, client)

@app.event("app_mention")
def handle_mention(event, say, client):
    """Handle @mentions in channels."""
    process_ask(event, say, client)

if __name__ == "__main__":
    handler = SocketModeHandler(app, os.environ["SLACK_APP_TOKEN"])
    handler.start()
```

### 6.3 Threading Model

All bot responses should be threaded to keep channels clean. Use the message's `ts` (timestamp) as the `thread_ts` for replies:

```python
def process_ask(event, say, client):
    thread_ts = event.get("thread_ts") or event["ts"]
    channel = event["channel"]

    # Post a "thinking" indicator
    thinking_msg = client.chat_postMessage(
        channel=channel,
        thread_ts=thread_ts,
        text=":mag: Searching the ERA network..."
    )

    # Run the matching pipeline
    results = run_matching_pipeline(ask, company_name, DB_PATH)

    # Update or post the results
    client.chat_update(
        channel=channel,
        ts=thinking_msg["ts"],
        blocks=format_results_as_blocks(results),
        text="Here are your matches"  # Fallback for notifications
    )
```

**Follow-up handling:** When a founder replies within the same thread (e.g., "actually more on the paid acquisition side"), the event will have a `thread_ts` pointing to the parent message. This enables refinement flows. The bot should treat threaded replies as follow-up asks that build on the original context.

### 6.4 DM vs. Channel Behavior

**DMs:** The bot sees all messages in a DM conversation. No @mention required. The first message should trigger founder identification.

**Channels:** The bot only sees @mentions (with `app_mentions:read` scope). This is preferred for v1 because it avoids accidentally processing every channel message.

**Recommendation:** Start with DM-only for the POC. Founders DM the bot directly. Channel support can be added later with @mention handling.

### 6.5 Message Formatting with Block Kit

Slack uses its own markup language called `mrkdwn` (not standard Markdown). Use Block Kit's section blocks for structured output:

```python
def format_results_as_blocks(results):
    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": ":sparkles: Network Matches"
            }
        }
    ]

    for i, match in enumerate(results["matches"], 1):
        blocks.append({"type": "divider"})
        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": (
                    f"*{i}. {match['name']}*\n"
                    f"{match['title']} at {match['company']}\n"
                    f"<{match['linkedin_url']}|LinkedIn Profile>\n\n"
                    f"{match['explanation']}"
                )
            }
        })
        if match.get("conversation_hooks"):
            blocks.append({
                "type": "context",
                "elements": [{
                    "type": "mrkdwn",
                    "text": f":speech_balloon: *Conversation starter:* {match['conversation_hooks']}"
                }]
            })

    return blocks
```

**Key `mrkdwn` syntax differences from standard Markdown:**
- Bold: `*text*` (single asterisk, not double)
- Italic: `_text_`
- Links: `<URL|display text>` (angle bracket syntax)
- No heading syntax (use header blocks instead)
- Newlines: literal `\n` in strings

### 6.6 Error Handling in Slack

- Post a user-friendly error message if the pipeline fails: "Sorry, I ran into an issue searching the network. Please try again."
- Use Slack's `chat_update` to replace the "thinking" message with results (avoids multiple bot messages)
- Rate limiting: Slack's Web API has rate limits (~1 request/second for `chat_postMessage`). Not a concern at our query volume.
- Timeouts: Slack expects event acknowledgment within 3 seconds. For long-running operations, acknowledge immediately and post results asynchronously.

```python
@app.event("message")
def handle_dm(event, say, client, ack):
    ack()  # Acknowledge immediately
    # Then process asynchronously...
```

### 6.7 Founder Identification

For v1, ask the founder to identify themselves on first interaction:

```python
def identify_founder(event, client):
    """Try to match Slack user to an ERA30 company."""
    user_info = client.users_info(user=event["user"])
    display_name = user_info["user"]["real_name"]

    # Try matching against era30_companies table
    company = lookup_company_by_founder_name(display_name)
    if company:
        return company

    # If no match, ask
    return None  # Triggers a "Which company are you with?" prompt
```

---

## 7. Data Model and Profile Compression

### 7.1 Database Schema (era_network_lite.db)

The SQLite database contains four relevant tables:

**contacts** (~1,289 rows): `contact_id`, `name`, `email`, `linkedin_url`, `photo_url`, `current_title`, `current_company`, `seniority`, `city`, `state`, `country`, `persona`, `contact_type`

**person_research** (~980 rows, ~796 with primary_expertise): `contact_id`, `primary_expertise`, `secondary_expertise`, `industry_verticals`, `functional_depth`, `topics_discussed`, `conversation_hooks`, `companies_founded`, `advisory_roles`, `actively_advising_startups`, `open_to_outreach`, `engagement_style`, `warm_intro_potential`, `shared_affiliations`

**career_history** (~10,334 rows): `contact_id`, `title`, `company`, `start_date`, `end_date`, `is_current`

**era30_companies** (14 rows): `company_name`, `website`, `industry`, `funding_stage`, `description`

### 7.2 Profile Compression for Stage 1

The compressed format must balance signal density with token budget. Target: ~50-60 tokens per contact, ~50K tokens total for ~800 enriched contacts.

```
[ID:742] Sarah Chen | VP Sales @ Datadog | GTM_LEADER
  Expertise: enterprise SaaS sales, PLG, sales ops
  Verticals: cloud infrastructure, DevOps, cybersecurity
  Advising: yes | Outreach: yes

[ID:215] Marcus Rivera | Founder @ TrueCredit (acq. 2021) | STARTUP_ECOSYSTEM
  Expertise: credit risk modeling, institutional finance
  Verticals: fintech, banking, insurance
  Advising: yes | Outreach: unknown
```

**What to include:** contact_id, name, current title, current company, persona, primary_expertise, secondary_expertise, industry_verticals, actively_advising_startups, open_to_outreach

**What to exclude:** email (privacy), photo_url, full career history, conversation_hooks (save for Stage 2), city/state/country (rarely relevant for matching)

**Implementation:**

```python
def compress_profile(contact, research) -> str:
    """Compress a single contact into a Stage 1 profile line."""
    parts = [
        f"[ID:{contact['contact_id']}] {contact['name']}",
        f"| {contact['current_title']} @ {contact['current_company']}",
        f"| {contact['persona']}"
    ]
    header = " ".join(parts)

    lines = [header]
    if research:
        expertise = []
        if research.get("primary_expertise"):
            expertise.append(research["primary_expertise"])
        if research.get("secondary_expertise"):
            expertise.append(research["secondary_expertise"])
        if expertise:
            lines.append(f"  Expertise: {', '.join(expertise)}")

        if research.get("industry_verticals"):
            lines.append(f"  Verticals: {research['industry_verticals']}")

        advising = research.get("actively_advising_startups", "unknown")
        outreach = research.get("open_to_outreach", "unknown")
        lines.append(f"  Advising: {advising} | Outreach: {outreach}")

    return "\n".join(lines)
```

### 7.3 Full Profile Assembly for Stage 2

Stage 2 receives the full research profile for each of the 20-30 shortlisted candidates, including career history highlights, conversation hooks, and advisory context. This is typically 200-500 tokens per contact, for a total of 5-15K tokens.

### 7.4 Excluding Un-enriched Contacts

183 contacts have no enrichment data (LinkedIn URL only). Exclude them from v1 matching. They'll never match well because there's no expertise or industry data to match against. Flag these as a future enrichment task.

---

## 8. Test and Evaluation Strategy

### 8.1 Three-Level Testing

**Level 1: Structural tests (no LLM calls)**
- Profile compression produces output for all enriched contacts
- Compressed profiles total is under 60K tokens
- Full profile retrieval works for any valid contact_id
- Company context lookup works for all 14 ERA30 companies
- Output schemas are valid

**Level 2: Pipeline integration tests (LLM calls)**
- Run test asks through the full pipeline
- Verify structural properties: exactly 3 results (or fewer with explanation), all required fields present, contact_ids exist in database, no duplicates, response time under 15 seconds

**Level 3: LLM-as-judge evaluation**
- Use a separate Claude call to score pipeline results against per-test-case criteria
- Aggregate pass rates across all test cases
- Target: 75%+ criteria pass rate before moving to Slack integration

### 8.2 Test Cases

Eight test cases covering different ask types, companies, and edge cases:

| Test ID | Ask Type | Company | Key Evaluation Criteria |
|---|---|---|---|
| fintech_credit_feedback | Domain feedback | Passu | Financial/credit backgrounds, not just VCs |
| legaltech_warm_intro | Warm intro request | Discernis | Legal industry connections, intro pathway |
| marketing_user_testing | Potential users | Astute Labs | Marketing roles at consumer brands |
| hospitality_industry_expert | Niche industry | MadeOnSite | Hospitality experience (handles sparse matches) |
| vague_ask | Ambiguous ask | Kandir | Should trigger clarifying question |
| enterprise_sales | GTM advice | Aerium | Enterprise sales/GTM leaders, VP+ seniority |
| fundraising | Investor intro | Philter | Seed-stage VCs, fintech focus |
| technical_feedback | Technical domain | Cascade Geomatics | Technical/engineering backgrounds, geospatial |

Full test case definitions with detailed criteria are in the PRD's "Test Fixtures" section and should be implemented verbatim in `test_fixtures.py`.

### 8.3 LLM-as-Judge Implementation

The judge prompt receives: the original ask, company context, the 3 returned matches with explanations, and the evaluation criteria. It scores each criterion as pass/fail with reasoning, then provides an overall score and improvement suggestions.

**Important:** Use the same model (Sonnet) but with a clearly separated judge prompt. The judge should not see the pipeline's system prompt or any internal reasoning. It evaluates only the inputs and outputs.

### 8.4 Prompt Iteration Loop

```
1. Run all 8 test cases through pipeline
2. Judge each result
3. Aggregate scores by criterion type
4. Identify the most common failure mode
5. Make a targeted prompt change
6. Re-run and compare
7. Log iteration scores for tracking progress
```

Stop iterating when 75%+ criteria pass rate is achieved across all test cases, or when improvements plateau.

---

## 9. Error Handling and Edge Cases

### 9.1 API Failures

- **Anthropic API timeout/error:** Retry once with exponential backoff. If retry fails, return a user-friendly error via Slack.
- **Rate limiting:** At our volume (40 queries/month), this shouldn't occur. If it does, queue and retry.
- **Malformed LLM output:** With structured outputs, this is eliminated. If using fallback approaches, parse with try/except and retry once.

### 9.2 Matching Edge Cases

- **Fewer than 3 strong matches:** Return fewer results and say so explicitly. "I found 1 strong match and 1 possible match for this ask. The ERA network may have limited coverage in this specific niche."
- **No matches:** "I couldn't find a strong match for this ask in the ERA network. Try broadening your request, or ask the ERA team for suggestions."
- **Vague ask:** Return a single clarifying question. "To find the best matches, could you tell me more about what kind of help you're looking for? For example, are you looking for domain feedback, a warm intro, or a potential user?"

### 9.3 Founder Identification Failures

If the bot can't identify which ERA30 company the founder belongs to, it should still attempt matching using only the ask (without company-specific context). The results will be less tailored but still useful.

---

## 10. Implementation Plan for AI Coding Agent

### 10.1 Phase 1: Foundation (no LLM calls)

| Step | Task | Validation |
|---|---|---|
| 1 | Create project structure and `requirements.txt` | Directory structure matches spec |
| 2 | Build `config.py` (env vars, constants) | Imports work, env vars load |
| 3 | Build `db.py` (database access layer) | Can read all tables, return typed dicts |
| 4 | Build `profiles.py` (compression + formatting) | Compressed profiles < 60K tokens |
| 5 | Run Level 1 structural tests | All pass |

### 10.2 Phase 2: Matching Pipeline (LLM calls, no Slack)

| Step | Task | Validation |
|---|---|---|
| 6 | Build `prompts.py` (first draft) | Prompts render correctly with test data |
| 7 | Build `matching.py` (full pipeline) | Single test ask returns structured results |
| 8 | Build test fixtures + evaluation harness | Judge runs on one test case |
| 9 | Run Level 2 integration tests | Structural properties verified |
| 10 | Run Level 3 LLM-as-judge evaluation | Scores logged |
| 11 | Iterate on prompts until 75%+ pass rate | Scores improve across iterations |

### 10.3 Phase 3: Slack Integration (requires human Slack setup)

| Step | Task | Validation |
|---|---|---|
| 12 | Build `slack_bot.py` | Bot connects via Socket Mode |
| 13 | Wire up DM and @mention handlers | Bot responds in thread |
| 14 | Add founder identification flow | Correct company context used |
| 15 | Format results as Block Kit messages | Renders correctly in Slack |

### 10.4 Phase 4: Polish

| Step | Task | Validation |
|---|---|---|
| 16 | Add error handling (API failures, empty results) | Graceful degradation verified |
| 17 | Add conversation thread support for follow-ups | Refinement asks work |
| 18 | Add logging for monitoring | Cache hit rate, query latency, errors logged |
| 19 | Add feedback mechanism (thumbs up/down reactions) | Reactions captured in logs |

### 10.5 Key Files and Their Interfaces

```python
# config.py
ANTHROPIC_API_KEY: str
SLACK_BOT_TOKEN: str
SLACK_APP_TOKEN: str
DB_PATH: str = "era_network_lite.db"
STAGE1_MODEL: str = "claude-sonnet-4-5-20250929"
STAGE2_MODEL: str = "claude-sonnet-4-5-20250929"

# db.py
def get_enriched_contacts(db_path: str) -> list[dict]
def get_research_profile(db_path: str, contact_id: int) -> dict | None
def get_career_highlights(db_path: str, contact_id: int) -> list[dict]
def get_company_context(db_path: str, company_name: str) -> dict | None

# profiles.py
def get_compressed_profiles(db_path: str) -> str  # Cached across queries
def get_full_profiles(db_path: str, contact_ids: list[int]) -> str

# matching.py
def assess_ask_clarity(ask: str, company_context: str) -> dict
def stage1_screen(ask: str, company_context: str, compressed: str) -> list[int]
def stage2_rank(ask: str, company_context: str, full_profiles: str) -> list[dict]
def run_matching_pipeline(ask: str, company_name: str, db_path: str) -> dict

# prompts.py
CLARITY_SYSTEM_PROMPT: str
STAGE1_SYSTEM_PROMPT: str
STAGE2_SYSTEM_PROMPT: str

# slack_bot.py
# Thin wrapper: receives Slack events, calls run_matching_pipeline,
# formats output as Block Kit, posts to Slack
```

---

## 11. Dependencies

```
# requirements.txt
anthropic>=0.40.0
slack-bolt>=1.20.0
slack-sdk>=3.30.0
python-dotenv>=1.0.0
pytest>=8.0.0
pydantic>=2.0.0   # For structured output schemas
tiktoken>=0.7.0   # For token counting validation
```

No embedding libraries. No vector databases. No ML dependencies.

---

## 12. Open Questions and Future Work

1. **Model selection for Stage 2:** Sonnet should suffice for both stages initially. If explanation quality is weak, A/B test with Opus for Stage 2 only.

2. **1-hour cache TTL:** If queries are infrequent (less than one every 5 minutes), the 1-hour TTL at 2x write cost may be worth it. Monitor cache miss rate in the first week.

3. **Conversation memory across threads:** For v1, each ask is independent. Future versions could track previous asks within a Slack thread and use them as context for refinement.

4. **Feedback loop:** Track which matches founders actually pursue (via thumbs up/down reactions or follow-up messages). This data can inform prompt tuning and, eventually, a collaborative filtering signal.

5. **Access control:** v1 surfaces name, title, company, LinkedIn URL, and match explanation. Emails are not shown. Intro routing through ERA is the intended workflow.

6. **Scaling past ~2,000 contacts:** Add an embedding-based pre-filter (Stage 0) in front of the current pipeline. The LLM stages remain identical.
