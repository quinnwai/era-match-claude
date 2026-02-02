# Multi-Backend LLM Support: Adding Gemini to era-match-claude

## Executive Summary

Add Gemini as a second backend option to `era-match-claude`, allowing runtime switching between Claude and Gemini via `LLM_PROVIDER` environment variable. The implementation uses a Strategy Pattern with backend adapters to preserve backend-specific optimizations while keeping business logic unchanged.

## Current State Analysis

### Repository Structure
- **era-match-claude/**: Uses Anthropic Claude API with tool-use and prompt caching
- **era-match/**: Uses Google Gemini API with native response schemas and extended thinking
- Both repos are ~70% identical in business logic (profiles, db, Slack integration)

### Key Differences

| Aspect | Claude (era-match-claude) | Gemini (era-match) |
|--------|--------------------------|-------------------|
| SDK | `anthropic>=0.40.0` | `google-genai>=1.0.0` |
| Structured Output | Tool-use pattern (forced tool call) | Native `response_schema` |
| Optimization | Prompt caching (ephemeral, 5-min TTL) | Extended thinking (1024-4096 token budget) |
| Message Format | Profiles in system prompt | Profiles in user message |
| Schema Field | `is_clear` | `clear` |
| Unique Features | query_log.py for observability | None |

### Architecture Decision

**Strategy Pattern with Backend Adapters**
- Abstract base class defines interface
- Concrete implementations for Claude and Gemini
- Factory pattern for runtime selection
- Backend-specific optimizations preserved

## Implementation Plan

### Phase 1: Backend Abstraction Layer

**Create new directory:** `era-match-claude/src/backends/`

#### 1.1 Base Class (`src/backends/base.py`)
Abstract interface defining three core methods:
```python
from abc import ABC, abstractmethod
from typing import Type
from pydantic import BaseModel

class LLMBackend(ABC):
    """Abstract base class for LLM provider backends."""

    @abstractmethod
    def assess_clarity(
        self, ask: str, company_context: str,
        system_prompt: str, response_schema: Type[BaseModel]
    ) -> dict:
        """Assess whether an ask is clear enough."""
        pass

    @abstractmethod
    def screen_candidates(
        self, ask: str, company_context: str, compressed_profiles: str,
        system_prompt: str, response_schema: Type[BaseModel]
    ) -> list[int]:
        """Screen compressed profiles (Stage 1)."""
        pass

    @abstractmethod
    def rank_matches(
        self, ask: str, company_context: str, full_profiles: str,
        system_prompt: str, response_schema: Type[BaseModel], top_k: int
    ) -> list[dict]:
        """Rank candidates and return top matches (Stage 2)."""
        pass

    @abstractmethod
    def get_model_config(self) -> dict[str, str]:
        """Return model names for each stage."""
        pass
```

#### 1.2 Claude Backend (`src/backends/claude_backend.py`)
Extract existing Claude implementation from `matching.py`:
- Move `_get_client()` and `_tool_use_call()` logic into class methods
- Preserve prompt caching on Stage 1 (`cache_control: ephemeral`)
- Keep tool-use pattern for structured output
- Maintain retry logic for `APITimeoutError`, `APIConnectionError`, `RateLimitError`

**Key implementation details:**
```python
class ClaudeBackend(LLMBackend):
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    def screen_candidates(self, ask, company_context, compressed_profiles,
                         system_prompt, response_schema):
        # Format system prompt with profiles
        formatted_prompt = system_prompt.format(profiles=compressed_profiles)

        result = self._tool_use_call(
            model=STAGE1_MODEL,
            system=[{
                "type": "text",
                "text": formatted_prompt,
                "cache_control": {"type": "ephemeral"},  # Prompt caching
            }],
            messages=[{
                "role": "user",
                "content": f"<company_context>\n{company_context}\n</company_context>\n\n<ask>\n{ask}\n</ask>",
            }],
            schema_class=response_schema,
            tool_name="report_screening",
            extra_headers={"anthropic-beta": "prompt-caching-2024-07-31"},
        )
        return result.selected_contact_ids
```

#### 1.3 Gemini Backend (`src/backends/gemini_backend.py`)
Port Gemini implementation from `era-match/src/matching.py`:
- Implement `genai.Client` initialization
- Add `_generate_with_retry()` method
- Use `GenerateContentConfig` with `response_schema` and `ThinkingConfig`
- Handle schema field name difference (`clear` vs `is_clear`) in wrapper
- Profiles go in user message (not system prompt)

**Key implementation details:**
```python
class GeminiBackend(LLMBackend):
    def __init__(self):
        self.client = genai.Client(api_key=GEMINI_API_KEY)

    def screen_candidates(self, ask, company_context, compressed_profiles,
                         system_prompt, response_schema):
        # Gemini: profiles go in user message, not system prompt
        user_msg = (
            f"<profiles>\n{compressed_profiles}\n</profiles>\n\n"
            f"<company_context>\n{company_context}\n</company_context>\n\n"
            f"<ask>\n{ask}\n</ask>"
        )

        # Strip {profiles} placeholder from system prompt
        formatted_system = system_prompt.replace("{profiles}", "").strip()

        response = self._generate_with_retry(
            model=GEMINI_STAGE1_MODEL,
            contents=[{"role": "user", "parts": [{"text": user_msg}]}],
            config=GenerateContentConfig(
                system_instruction=formatted_system,
                response_mime_type="application/json",
                response_schema=response_schema,
                max_output_tokens=16384,
                thinking_config=ThinkingConfig(thinking_budget=4096),  # Extended thinking
            ),
        )

        result = response_schema.model_validate_json(response.text)
        return result.selected_contact_ids
```

#### 1.4 Backend Registry (`src/backends/__init__.py`)
Factory function:
```python
from src.backends.base import LLMBackend
from src.backends.claude_backend import ClaudeBackend
from src.backends.gemini_backend import GeminiBackend

BACKENDS = {
    "claude": ClaudeBackend,
    "gemini": GeminiBackend,
}

def get_backend(provider: str) -> LLMBackend:
    """Factory function to create backend instance."""
    if provider not in BACKENDS:
        raise ValueError(f"Unknown provider: {provider}. Available: {list(BACKENDS.keys())}")
    return BACKENDS[provider]()

__all__ = ["LLMBackend", "get_backend", "ClaudeBackend", "GeminiBackend"]
```

### Phase 2: Configuration & Integration

#### 2.1 Update `src/config.py`
Add:
```python
# API keys
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")  # NEW
SLACK_BOT_TOKEN = os.getenv("SLACK_BOT_TOKEN", "")
SLACK_APP_TOKEN = os.getenv("SLACK_APP_TOKEN", "")

# Backend selection
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "claude").lower()  # NEW: claude | gemini
```

Keep existing Claude model config for backward compatibility.

#### 2.2 Refactor `src/matching.py`
Replace direct Claude API calls with backend abstraction:

**Before:**
```python
def assess_ask_clarity(ask: str, company_context: str) -> dict:
    client = _get_client()
    result = _tool_use_call(
        client,
        model=CLARITY_MODEL,
        system=[{"type": "text", "text": CLARITY_SYSTEM_PROMPT}],
        messages=[...],
        schema_class=ClarityResult,
        tool_name="report_clarity",
    )
    return result.model_dump()
```

**After:**
```python
from src.backends import get_backend

_backend = None

def _get_backend():
    global _backend
    if _backend is None:
        _backend = get_backend(LLM_PROVIDER)
        logger.info(f"Initialized LLM backend: {LLM_PROVIDER}")
    return _backend

def assess_ask_clarity(ask: str, company_context: str) -> dict:
    backend = _get_backend()
    return backend.assess_clarity(
        ask=ask,
        company_context=company_context,
        system_prompt=CLARITY_SYSTEM_PROMPT,
        response_schema=ClarityResult,
    )
```

Apply same pattern to:
- `stage1_screen()` → `backend.screen_candidates(...)`
- `stage2_rank()` → `backend.rank_matches(...)`

Keep:
- Pydantic schemas (ClarityResult, Stage1Result, MatchExplanation, Stage2Result)
- `run_matching_pipeline()` orchestration unchanged

#### 2.3 Update `requirements.txt`
Add:
```
anthropic>=0.40.0
google-genai>=1.0.0
slack-bolt>=1.20.0
slack-sdk>=3.30.0
python-dotenv>=1.0.0
pytest>=8.0.0
pydantic>=2.0.0
tiktoken>=0.7.0
```

#### 2.4 Update `.env`
Add:
```bash
# LLM Provider Selection
LLM_PROVIDER=claude  # Options: claude, gemini

# API Keys
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...  # Add your Gemini API key

# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
```

### Phase 3: Schema Compatibility

**Issue:** Gemini version uses `clear` field, Claude uses `is_clear` in ClarityResult.

**Solution:** Standardize on `is_clear` (Claude convention):
- Keep `is_clear` in Pydantic schema
- Gemini backend converts response internally if needed

Alternative: Update both to use same field name in their respective implementations.

### Phase 4: Testing & Validation

#### 4.1 Backend Tests (`tests/test_backends.py`)
```python
import pytest
import os
from src.backends import get_backend, ClaudeBackend, GeminiBackend

def test_backend_registry():
    """Test backend factory function."""
    claude = get_backend("claude")
    assert isinstance(claude, ClaudeBackend)

    gemini = get_backend("gemini")
    assert isinstance(gemini, GeminiBackend)

    with pytest.raises(ValueError):
        get_backend("nonexistent")

@pytest.mark.skipif(not os.getenv("ANTHROPIC_API_KEY"), reason="No Claude API key")
def test_claude_backend_clarity():
    """Integration test: Claude clarity check."""
    from src.prompts import CLARITY_SYSTEM_PROMPT
    from src.matching import ClarityResult

    backend = ClaudeBackend()
    result = backend.assess_clarity(
        ask="I need help with enterprise sales",
        company_context="Company: TestCo",
        system_prompt=CLARITY_SYSTEM_PROMPT,
        response_schema=ClarityResult,
    )
    assert "is_clear" in result
```

#### 4.2 Update Existing Tests
Modify `tests/test_matching_pipeline.py`:
```python
import os
import pytest

BACKEND = os.getenv("LLM_PROVIDER", "claude")

@pytest.fixture(autouse=True)
def check_api_key():
    """Skip tests if required API key is missing."""
    if BACKEND == "claude" and not os.getenv("ANTHROPIC_API_KEY"):
        pytest.skip("ANTHROPIC_API_KEY not set")
    elif BACKEND == "gemini" and not os.getenv("GEMINI_API_KEY"):
        pytest.skip("GEMINI_API_KEY not set")
```

#### 4.3 Manual Testing
```bash
# Test with Claude
export LLM_PROVIDER=claude
pytest tests/

# Test with Gemini
export LLM_PROVIDER=gemini
pytest tests/

# Test Slack bot
python scripts/run_slack_bot.py
```

### Phase 5: Documentation

#### 5.1 Migration Guide (`MIGRATION_GUIDE.md`)
Create comprehensive guide covering:
- Configuration instructions
- Architecture overview
- Backend-specific features
- Switching between backends
- Adding new backends (OpenAI, etc.)
- Troubleshooting

#### 5.2 Update `CLAUDE.md`
Add section:
```markdown
## Multi-Backend Support

The system now supports both Claude and Gemini backends:

- **Claude** (default): Uses Anthropic API with prompt caching
- **Gemini**: Uses Google GenAI API with extended thinking

### Configuration

Set `LLM_PROVIDER` in `.env`:
```bash
LLM_PROVIDER=claude  # or gemini
```

### Backend-Specific Features

- **Claude**: Prompt caching on Stage 1 profiles (~90% cache hit rate)
- **Gemini**: Extended thinking (4096 token budget for screening/ranking)

See `MIGRATION_GUIDE.md` for detailed information.
```

## Critical Files

### Files to Create (4 new files)
1. `era-match-claude/src/backends/__init__.py` - Backend registry and factory
2. `era-match-claude/src/backends/base.py` - Abstract interface (LLMBackend)
3. `era-match-claude/src/backends/claude_backend.py` - Claude implementation
4. `era-match-claude/src/backends/gemini_backend.py` - Gemini implementation

### Files to Modify (4 files)
1. `era-match-claude/src/config.py` - Add GEMINI_API_KEY and LLM_PROVIDER
2. `era-match-claude/src/matching.py` - Replace direct API calls with backend abstraction
3. `era-match-claude/requirements.txt` - Add google-genai>=1.0.0
4. `era-match-claude/.env` - Add LLM_PROVIDER and GEMINI_API_KEY

### Files Unchanged (business logic)
- `src/prompts.py` - Prompts are backend-agnostic
- `src/profiles.py` - Profile formatting unchanged
- `src/db.py` - Database layer unchanged
- `src/slack_bot.py` - Slack integration unchanged
- `src/query_log.py` - Logging unchanged

## Backend-Specific Optimizations Preserved

### Claude
- **Prompt Caching**: Stage 1 profiles in system prompt with `cache_control: ephemeral`
- **Tool-Use**: Structured output via forced tool calls
- **Cost Efficiency**: ~90% cache hit rate reduces cost from $0.15 to $0.02 per query

### Gemini
- **Extended Thinking**: `ThinkingConfig(thinking_budget=1024)` for clarity, `4096` for screening/ranking
- **Native Schemas**: Simpler `response_schema` parameter
- **Cost Advantage**: ~$0.10 per query baseline

## Verification Plan

### Functional Testing
1. Run all existing tests with Claude backend (should pass)
2. Run all existing tests with Gemini backend (should pass)
3. Manual Slack bot testing with both backends

### Performance Testing
Compare metrics for both backends:
- Response times (clarity, stage1, stage2, total)
- Token usage and costs
- Cache hit rates (Claude only)
- Match quality (using existing eval harness)

### Success Criteria
- ✅ All existing tests pass with Claude
- ✅ All existing tests pass with Gemini
- ✅ Slack bot works with both backends
- ✅ Backend switching via env var works
- ✅ No regression in match quality
- ✅ Query logging works with both backends

## Risk Assessment

### Low Risk
- No changes to business logic (prompts, profiles, db unchanged)
- Existing Claude functionality preserved exactly
- New code isolated in `backends/` directory
- Easy rollback via `LLM_PROVIDER=claude`

### Medium Risk
- Additional dependency (`google-genai`)
- Need to manage two API keys
- Potential for backend-specific bugs

### Mitigation Strategies
- Extensive testing with both backends
- Clear separation of concerns
- Comprehensive error handling and logging
- Gradual rollout with monitoring
- Easy rollback mechanism

## Implementation Timeline

### Week 1: Foundation (6-8 hours)
- Day 1-2: Create backend abstraction layer (base.py, __init__.py)
- Day 3-4: Implement Claude backend (extract from matching.py)
- Day 5: Implement Gemini backend (port from era-match)

### Week 2: Integration (4-6 hours)
- Day 1: Update config.py and matching.py
- Day 2: Update requirements.txt, create .env.example
- Day 3: Write backend tests

### Week 3: Testing & Documentation (4-6 hours)
- Day 1-2: Run full test suite, fix issues
- Day 3: Write migration guide and update docs
- Day 4: Manual testing with both backends

### Week 4: Validation & Rollout (2-4 hours)
- Deploy to staging
- Performance benchmarking
- Production rollout with monitoring

**Total Estimated Effort: 16-24 hours**

## Future Enhancements

1. **Backend Auto-Selection**
   - Fallback to Gemini if Claude is down
   - Cost-based routing (use cheaper backend for clarity checks)

2. **A/B Testing Framework**
   - Route percentage of traffic to each backend
   - Compare match quality and user satisfaction

3. **Hybrid Approach**
   - Use Claude for Stage 1 (better caching)
   - Use Gemini for Stage 2 (better reasoning)

4. **Additional Backends**
   - OpenAI GPT-4
   - Anthropic Claude Opus (for premium users)
   - Local models (Llama, Mistral) for privacy-sensitive deployments

## Rollback Plan

If issues arise:
1. Set `LLM_PROVIDER=claude` in production .env
2. Restart service
3. Investigate logs for errors
4. Fix and re-test in staging
5. Redeploy when validated

## Performance Comparison (Expected)

| Backend | Clarity | Stage 1 | Stage 2 | Total | Cost/Query |
|---------|---------|---------|---------|-------|------------|
| Claude  | ~2s     | ~8s     | ~5s     | ~15s  | ~$0.02 (with cache) |
| Gemini  | ~2s     | ~10s    | ~6s     | ~18s  | ~$0.10     |

(Times approximate, depends on network and load)

## Appendix: Code Snippets

### Example Backend Adapter Implementation

```python
# src/backends/claude_backend.py (excerpt)
class ClaudeBackend(LLMBackend):
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    def _tool_use_call(self, model, system, messages, schema_class, tool_name, retries=1, **kwargs):
        """Make API call using tool-use for structured output."""
        tools = [{
            "name": tool_name,
            "description": f"Report the {tool_name} results",
            "input_schema": schema_class.model_json_schema(),
        }]

        for attempt in range(1 + retries):
            try:
                message = self.client.messages.create(
                    model=model,
                    max_tokens=4096,
                    system=system,
                    messages=messages,
                    tools=tools,
                    tool_choice={"type": "tool", "name": tool_name},
                    **kwargs,
                )

                for block in message.content:
                    if block.type == "tool_use":
                        return schema_class.model_validate(block.input)

            except (anthropic.APITimeoutError, anthropic.APIConnectionError) as e:
                if attempt < retries:
                    time.sleep(2 ** attempt)
                else:
                    raise
```

### Example Factory Usage

```python
# src/matching.py (excerpt)
from src.backends import get_backend
from src.config import LLM_PROVIDER

_backend = None

def _get_backend():
    global _backend
    if _backend is None:
        _backend = get_backend(LLM_PROVIDER)
    return _backend

def assess_ask_clarity(ask: str, company_context: str) -> dict:
    backend = _get_backend()
    return backend.assess_clarity(
        ask=ask,
        company_context=company_context,
        system_prompt=CLARITY_SYSTEM_PROMPT,
        response_schema=ClarityResult,
    )
```
