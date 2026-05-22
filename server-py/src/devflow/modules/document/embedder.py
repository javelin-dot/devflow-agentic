"""Embedding facade. Document module never imports an LLM SDK directly — it goes through here,
and the implementation delegates to the agent module's embedding service."""

from __future__ import annotations

from typing import Protocol


class Embedder(Protocol):
    model: str
    dim: int

    async def embed(self, texts: list[str]) -> list[list[float]]: ...


_default_embedder: Embedder | None = None


def get_embedder() -> Embedder:
    global _default_embedder
    if _default_embedder is None:
        from devflow.modules.agent.embedding import OpenAIEmbedder

        _default_embedder = OpenAIEmbedder()
    return _default_embedder


def set_embedder(e: Embedder) -> None:
    global _default_embedder
    _default_embedder = e
