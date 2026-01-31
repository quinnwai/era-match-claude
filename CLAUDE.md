# ERA Network Matching Bot — Progress & Context

## What This Is

A Slack bot that lets ERA30 cohort founders query a network of ~1,289 contacts (685 alumni, 604 mentors) using natural language. A founder types an ask and gets back the 3 best-matched people with explanations.

Uses a two-stage LLM approach (no embeddings, no vector store) — the entire compressed network fits in a single Claude context window (~50K tokens).

## Project Structure

```
src/
  config.py       — env vars, model config, constants
  db.py           — SQLite access layer (contacts, research, career, companies)
  profiles.py     — profile compression (Stage 1) and full formatting (Stage 2)
  prompts.py      — all LLM prompts (clarity check, screening, ranking)
  matching.py     — full pipeline: clarity → stage1 → stage2
  slack_bot.py    — Slack Bot (DM, @mention, company selection, Block Kit)

tests/
  test_profiles.py           — Level 1: structural tests (16 tests, no LLM)
  test_matching_pipeline.py  — Level 2: integration tests (3 tests, LLM calls)
  test_evaluation.py         — Level 3: LLM-as-judge harness (8 test cases)
  test_fixtures.py           — test case definitions with eval criteria
  test_slack_bot.py          — Slack formatting/logic tests (6 tests, no Slack)

scripts/
  run_slack_bot.py       — entry point: python scripts/run_slack_bot.py
  run_evaluation.py      — run full eval suite
  inspect_profiles.py    — debug: view compressed profiles + token count
```

## Implementation Status

| Phase | Status | Details |
|-------|--------|---------|
| Phase 1: Foundation | DONE | db.py, profiles.py, config.py — 16/16 tests pass |
| Phase 2: Matching Pipeline | DONE | prompts.py, matching.py, eval harness — 31/31 criteria pass (100%) |
| Phase 3: Slack Integration | DONE | slack_bot.py — 6/6 tests pass, needs valid Slack tokens to run live |
| Phase 4: Polish | DONE | Retry/backoff, usage logging, cache tracking, feedback reactions |

## Key Design Decisions

- **Tool-use for structured output** instead of `output_format` (SDK v0.77 doesn't support it yet). Uses forced tool calls with Pydantic schemas.
- **Prompt caching** on Stage 1 system prompt (profiles block) via `cache_control: ephemeral`.
- **Profile compression** truncates expertise/verticals to fit under 60K tokens (~56K actual). Shuffles order per query to mitigate positional attention bias.
- **Clarity check** is conservative — only asks for clarification on genuinely ambiguous asks like "know anyone useful?" Fundraising, niche industries, etc. proceed directly.

## Running

```bash
# Install deps
pip install -r requirements.txt

# Run fast tests (no LLM calls)
python -m pytest tests/test_profiles.py tests/test_slack_bot.py -v

# Run integration tests (needs ANTHROPIC_API_KEY)
python -m pytest tests/test_matching_pipeline.py -v

# Run full eval suite (needs ANTHROPIC_API_KEY, ~5 min)
python scripts/run_evaluation.py

# Start Slack bot (needs all 3 tokens in .env)
python scripts/run_slack_bot.py
```

## Environment (.env)

```
ANTHROPIC_API_KEY=sk-ant-...
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
```

## What's Left

- Slack tokens need to be valid (current ones returned `not_authed` during testing)
- Manual testing in a real Slack workspace
- Conversation thread memory for follow-up refinements (basic threading works, but no context carry-over between messages in a thread)
- Production deployment (hosting TBD)
