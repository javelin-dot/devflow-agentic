from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from devflow.modules.document.models import (
    Document,
    DocumentAcl,
    DocumentChunk,
    DocumentVersion,
)


class DocumentRepository:
    def __init__(self, session: AsyncSession):
        self.s = session

    async def get(self, doc_id: str) -> Document | None:
        return await self.s.get(Document, doc_id)

    async def list(
        self, tenant_id: str, *, doc_type: str | None, req_id: str | None, status: str | None, offset: int, limit: int
    ) -> tuple[list[Document], int]:
        base = select(Document).where(
            Document.tenant_id == tenant_id, Document.deleted_at.is_(None)
        )
        if doc_type:
            base = base.where(Document.type == doc_type)
        if req_id:
            base = base.where(Document.req_id == req_id)
        if status:
            base = base.where(Document.status == status)
        total = (await self.s.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        stmt = base.order_by(Document.updated_at.desc()).offset(offset).limit(limit)
        rows = list((await self.s.execute(stmt)).scalars().all())
        return rows, int(total)

    async def add(self, doc: Document) -> Document:
        self.s.add(doc)
        await self.s.flush()
        return doc

    async def latest_version(self, doc_id: str) -> DocumentVersion | None:
        stmt = (
            select(DocumentVersion)
            .where(DocumentVersion.doc_id == doc_id)
            .order_by(DocumentVersion.version.desc())
            .limit(1)
        )
        return (await self.s.execute(stmt)).scalar_one_or_none()

    async def add_version(self, ver: DocumentVersion) -> DocumentVersion:
        self.s.add(ver)
        await self.s.flush()
        return ver

    async def replace_chunks(self, doc_version_id: str, chunks: list[DocumentChunk]) -> None:
        from sqlalchemy import delete

        await self.s.execute(
            delete(DocumentChunk).where(DocumentChunk.doc_version_id == doc_version_id)
        )
        self.s.add_all(chunks)
        await self.s.flush()


class AclRepository:
    def __init__(self, session: AsyncSession):
        self.s = session

    async def grant(self, entry: DocumentAcl) -> DocumentAcl:
        self.s.add(entry)
        await self.s.flush()
        return entry

    async def revoke(self, doc_id: str, principal_type: str, principal_id: str) -> None:
        from sqlalchemy import and_, delete

        await self.s.execute(
            delete(DocumentAcl).where(
                and_(
                    DocumentAcl.doc_id == doc_id,
                    DocumentAcl.principal_type == principal_type,
                    DocumentAcl.principal_id == principal_id,
                )
            )
        )
