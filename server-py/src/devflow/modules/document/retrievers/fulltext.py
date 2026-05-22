from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from devflow.modules.document.models import DocumentChunk
from devflow.modules.document.retrievers.base import Hit, SearchQuery


class FulltextRetriever:
    name = "fulltext"

    async def search(self, session: AsyncSession, q: SearchQuery) -> list[Hit]:
        ts_query = func.plainto_tsquery("simple", q.text)
        rank = func.ts_rank_cd(DocumentChunk.tsv, ts_query).label("rank")
        stmt = (
            select(DocumentChunk, rank)
            .where(DocumentChunk.tenant_id == q.tenant_id)
            .where(DocumentChunk.tsv.op("@@")(ts_query))
            .order_by(rank.desc())
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
                score=float(row.rank),
                source="fulltext",
                metadata=row.DocumentChunk.metadata_ or {},
            )
            for row in rows
        ]
