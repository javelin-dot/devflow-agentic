"""Reciprocal Rank Fusion (RRF) combiner. Cheap, no training, gives reasonable hybrid behavior."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from devflow.modules.document.retrievers.base import Hit, Retriever, SearchQuery


class HybridRetriever:
    name = "hybrid"

    def __init__(self, retrievers: list[Retriever], k: int = 60) -> None:
        self.retrievers = retrievers
        self.k = k

    async def search(self, session: AsyncSession, q: SearchQuery) -> list[Hit]:
        all_hits: list[list[Hit]] = []
        for r in self.retrievers:
            all_hits.append(await r.search(session, q))

        # RRF: score(d) = sum_r 1 / (k + rank_r(d))
        merged: dict[int, Hit] = {}
        rrf: dict[int, float] = {}
        for results in all_hits:
            for rank, hit in enumerate(results, start=1):
                merged.setdefault(hit.chunk_id, hit)
                rrf[hit.chunk_id] = rrf.get(hit.chunk_id, 0.0) + 1.0 / (self.k + rank)
        ordered = sorted(merged.values(), key=lambda h: rrf[h.chunk_id], reverse=True)
        for h in ordered:
            h.score = rrf[h.chunk_id]
            h.source = "hybrid"
        return ordered[: q.top_k]
