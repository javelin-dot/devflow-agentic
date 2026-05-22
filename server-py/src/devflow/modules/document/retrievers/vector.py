from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from devflow.modules.document.embedder import get_embedder
from devflow.modules.document.models import DocumentChunk
from devflow.modules.document.retrievers.base import Hit, SearchQuery


class VectorRetriever:
    name = "vector"

    async def search(self, session: AsyncSession, q: SearchQuery) -> list[Hit]:
        embedder = get_embedder()
        [vec] = await embedder.embed([q.text])
        model = q.embedding_model or embedder.model

        stmt = (
            select(
                DocumentChunk,
                DocumentChunk.embedding.cosine_distance(vec).label("distance"),
            )
            .where(DocumentChunk.tenant_id == q.tenant_id)
            .where(DocumentChunk.embedding_model == model)
            .order_by("distance")
            .limit(q.top_k)
        )
        rows = (await session.execute(stmt)).all()
        return [
            Hit(
                chunk_id=row.DocumentChunk.id,
                doc_id=row.DocumentChunk.doc_id,
                doc_version_id=row.DocumentChunk.doc_version_id,
                seq=row.DocumentChunk.seq,
                content=row.DocumentChunk.content,
                score=1.0 - float(row.distance),
                source="vector",
                metadata=row.DocumentChunk.metadata_ or {},
            )
            for row in rows
        ]
