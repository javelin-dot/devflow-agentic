from __future__ import annotations

from devflow.modules.document.chunkers.base import Chunk, Chunker, ChunkerRegistry
from devflow.modules.document.chunkers.fixed_size import FixedSizeChunker
from devflow.modules.document.chunkers.heading_aware import HeadingAwareChunker

_registry = ChunkerRegistry()
_registry.register(FixedSizeChunker())
_registry.register(HeadingAwareChunker())


def get_registry() -> ChunkerRegistry:
    return _registry


__all__ = ["Chunk", "Chunker", "ChunkerRegistry", "get_registry"]
