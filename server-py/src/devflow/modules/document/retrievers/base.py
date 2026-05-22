from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(slots=True)
class SearchQuery:
    text: str
    tenant_id: str
    actor_id: str | None = None
    actor_role: str = "viewer"
    top_k: int = 8
    doc_types: list[str] = field(default_factory=list)
    req_id: str | None = None
    embedding_model: str | None = None


@dataclass(slots=True)
class Hit:
    chunk_id: int
    doc_id: str
    doc_version_id: str
    seq: int
    content: str
    score: float
    source: str  # vector | fulltext | hybrid
    metadata: dict[str, object] = field(default_factory=dict)


class Retriever(Protocol):
    name: str

    async def search(self, session: AsyncSession, q: SearchQuery) -> list[Hit]: ...
