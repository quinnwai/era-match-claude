from src.backends.base import LLMBackend


def get_backend(provider: str) -> LLMBackend:
    """Factory function to create backend instance."""
    if provider == "claude":
        from src.backends.claude_backend import ClaudeBackend
        return ClaudeBackend()
    elif provider == "gemini":
        from src.backends.gemini_backend import GeminiBackend
        return GeminiBackend()
    else:
        raise ValueError(f"Unknown provider: {provider}. Available: ['claude', 'gemini']")


__all__ = ["LLMBackend", "get_backend"]
