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
        """Screen compressed profiles (Stage 1). Returns list of contact IDs."""
        pass

    @abstractmethod
    def rank_matches(
        self, ask: str, company_context: str, full_profiles: str,
        system_prompt: str, response_schema: Type[BaseModel], top_k: int
    ) -> list[dict]:
        """Rank candidates and return top matches (Stage 2)."""
        pass
