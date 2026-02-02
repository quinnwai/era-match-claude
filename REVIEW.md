# Code Review: ERA Network Matching Bot

## PR Summary

Slack bot that lets ERA30 startup founders query a ~1,289-person mentor/alumni network using natural language. Uses a two-stage LLM pipeline (Claude): Stage 1 screens ~800 compressed profiles to 15-30 candidates, Stage 2 ranks to top 3 with explanations. Integrates via Slack Socket Mode with company selection, Block Kit formatting, query logging, and feedback reactions.

## Review Findings

### Critical (Must fix before merge)

1. **[Security — Prompt Injection]** (`matching.py:128,151,174`): User input from Slack is passed directly into LLM prompts without sanitization. A user could craft input containing XML-like tags (`</ask>`, `</company_context>`) to break out of the prompt structure and manipulate LLM behavior. **Fix**: Strip or escape `<` and `>` in user-provided `ask` text, or use randomized boundary tokens instead of predictable XML tags.

2. **[Security — Slack Markdown Injection]** (`slack_bot.py:86-89`): LLM-generated output (names, explanations, conversation hooks) is posted directly to Slack as `mrkdwn` without sanitization. A manipulated LLM response could contain `@here`, `@channel`, or malicious link formatting. **Fix**: Escape Slack special characters (`<`, `>`, `&`, `@`) in LLM-generated fields before posting.

3. **[Concurrency — Race Condition on Global State]** (`slack_bot.py:17`): `_user_company_map` is a plain `dict` shared across concurrent Slack event handler threads. `slack-bolt` processes events in threads, so concurrent reads/writes are unsafe. **Fix**: Use `threading.Lock` around accesses, or use a thread-safe store.

4. **[Resilience — No Input Length Limit]** (`slack_bot.py:110`): No limit on user input length. An extremely long message causes expensive LLM API calls since the full text is embedded in prompts. **Fix**: Truncate or reject input exceeding a reasonable limit (e.g., 2000 characters) before passing to the pipeline.

### Important (Strongly recommend fixing)

5. **[Resource Management — DB Connections Not Using Context Managers]** (`db.py`, `query_log.py`): Every function manually calls `conn.close()`. If an exception occurs between `_connect()` and `conn.close()`, the connection leaks. **Fix**: Use `with _connect(db_path) as conn:` or wrap in try/finally.

6. **[Error Handling — Silent Secret Manager Failure]** (`config.py:48-50`): Catches all exceptions from Secret Manager and returns empty string. If secrets fail to load, the bot starts with empty API keys and fails confusingly later. **Fix**: Log at ERROR level and consider failing fast at startup if critical secrets are missing.

7. **[Slack — Threaded Reply Hijacking]** (`slack_bot.py:181-182`): Processes ALL threaded replies in channels, not just threads the bot started. Any threaded message in a channel where the bot is present triggers the pipeline. **Fix**: Track thread timestamps where the bot was mentioned, and only process follow-ups in those threads.

8. **[Performance — New Anthropic Client Per Call]** (`matching.py:51-52`): Creates a new `anthropic.Anthropic()` client for every API call. The pipeline makes 3 calls, creating 3 HTTP clients. **Fix**: Create the client once in `run_matching_pipeline` and pass it through, or use a module-level singleton.

9. **[Performance — N+1 DB Queries in Stage 2]** (`profiles.py:117-122`): Makes 2 DB queries per candidate in a loop of 15-30 candidates (30-60 sequential DB calls). **Fix**: Batch query with `WHERE contact_id IN (...)` to reduce to 2 queries total.

10. **[Dead Code — Unused Import]** (`profiles.py:2`): `lru_cache` imported from `functools` but never used.

11. **[Testing — Tests Depend on Real Database]** (`test_profiles.py`, `test_slack_bot.py:54-58`): Tests labeled "no LLM calls" still require the production SQLite database, making them non-portable. **Fix**: Mock DB calls in unit tests.

12. **[Dependencies — `tiktoken` in Production]**: Only used in `test_profiles.py` but listed as a production dependency. **Fix**: Move to dev/test requirements.

13. **[Dependencies — `google-cloud-secret-manager` Always Installed]**: Heavy dependency installed in all environments but only needed when `GCP_PROJECT_ID` is set. **Fix**: Make it optional.

### Minor (Nice to have)

14. **[Style — `sys.path` Manipulation in Tests]**: Every test file does `sys.path.insert(0, ...)`. **Fix**: Use `pyproject.toml` with `pythonpath = ["."]` or `pip install -e .`.

15. **[Type Hints — Incomplete]**: `_tool_use_call` has no return type annotation. Dict structures (contacts, profiles) are untyped. Consider `TypedDict` for structured data shapes.

16. **[Logging — `basicConfig` at Import Time]** (`slack_bot.py:10`): Sets root logger config at module import, which can interfere with other modules. **Fix**: Move to `start()` or the entry point script.

17. **[Correctness — Segment Markers Off-by-One]** (`profiles.py:54-55`): Segment markers don't align precisely with profile numbering. Minor cosmetic issue.

18. **[Cost — Same Model for All Stages]** (`config.py:59-61`): Uses `claude-sonnet-4-5` for all three stages including the simple clarity check. Haiku would likely suffice for clarity assessment and reduce cost/latency.

19. **[Documentation — No Docstring on `_process_ask`]** (`slack_bot.py:105`): Core Slack handler orchestrating the full flow has no docstring.

### Positive Observations

- **Clean two-stage architecture**: Screen-then-rank is well-designed. Compressed profiles for Stage 1 and full profiles for Stage 2 is smart context budget management.
- **Tool-use for structured output**: Pydantic schemas with forced tool calls is a robust pattern for typed LLM responses.
- **Prompt caching**: `cache_control: ephemeral` on Stage 1 system prompt is a good optimization for repeated queries.
- **Shuffle for positional bias mitigation**: Randomizing profile order per query is a thoughtful detail.
- **Graceful error UX**: Thinking indicator updated to results or error message provides good user feedback.
- **Three-tier testing strategy**: Structural, integration, and LLM-as-judge evaluation is comprehensive for an LLM application.
- **Query logging with feedback**: Reaction-based feedback loop is useful for iterating on match quality.

## Overall Assessment

**Request Changes**

The codebase is well-structured with thoughtful LLM orchestration and clean separation of concerns. The critical issues around prompt injection, Slack output sanitization, concurrent state access, and unbounded input length should be addressed before production deployment. The important items (DB connection safety, thread hijacking, per-call client creation) would improve reliability under load.
