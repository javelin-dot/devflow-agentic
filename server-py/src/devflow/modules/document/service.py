from __future__ import annotations

import hashlib

from sqlalchemy.ext.asyncio import AsyncSession

from devflow.config import get_settings
from devflow.core.audit import write_audit
from devflow.core.db import utcnow
from devflow.core.deps import CurrentUser
from devflow.core.errors import Forbidden, NotFound
from devflow.core.events import DomainEvent, get_event_bus
from devflow.core.ids import new_id
from devflow.modules.document.acl import can_read, invalidate_doc
from devflow.modules.document.chunkers import get_registry as get_chunker_registry
from devflow.modules.document.embedder import get_embedder
from devflow.modules.document.models import (
    Document,
    DocumentAcl,
    DocumentChunk,
    DocumentVersion,
)
from devflow.modules.document.parsers import get_registry as get_parser_registry
from devflow.modules.document.repository import AclRepository, DocumentRepository
from devflow.modules.document.retrievers import (
    FulltextRetriever,
    HybridRetriever,
    SearchQuery,
    VectorRetriever,
)
from devflow.modules.document.retrievers.base import Hit
from devflow.modules.document.schemas import CreateDocumentIn, GrantAclIn
from devflow.modules.document.storage import doc_object_key, get_blob, put_document_blob


def _hash_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


class DocumentService:
    def __init__(self, session: AsyncSession):
        self.s = session
        self.repo = DocumentRepository(session)
        self.acls = AclRepository(session)
        self.tenant = get_settings().default_tenant

    async def create(self, body: CreateDocumentIn, actor: CurrentUser) -> Document:
        doc = Document(
            id=new_id("doc"),
            tenant_id=self.tenant,
            req_id=body.req_id,
            type=body.type,
            title=body.title,
        )
        await self.repo.add(doc)
        # creator gets implicit admin ACL
        await self.acls.grant(
            DocumentAcl(
                id=new_id("acl"),
                doc_id=doc.id,
                principal_type="user",
                principal_id=actor.id,
                permission="admin",
            )
        )
        await write_audit(
            self.s,
            tenant_id=self.tenant,
            actor_id=actor.id,
            action="document.create",
            target_type="document",
            target_id=doc.id,
            after={"title": doc.title, "type": doc.type},
        )
        return doc

    async def get(self, doc_id: str, actor: CurrentUser) -> Document:
        doc = await self.repo.get(doc_id)
        if not doc or doc.deleted_at:
            raise NotFound(f"document {doc_id} not found")
        if not await can_read(self.s, actor, doc_id):
            raise Forbidden("no read permission")
        return doc

    async def list(
        self,
        actor: CurrentUser,
        *,
        doc_type: str | None,
        req_id: str | None,
        status: str | None,
        offset: int,
        limit: int,
    ) -> tuple[list[Document], int]:
        # Listing uses tenant filter; ACL filtering is applied lazily on get/search.
        return await self.repo.list(self.tenant, doc_type=doc_type, req_id=req_id, status=status, offset=offset, limit=limit)

    async def upload_version(
        self,
        doc_id: str,
        *,
        filename: str,
        blob: bytes,
        mime: str,
        actor: CurrentUser,
        parser_name: str | None = None,
        chunker_name: str = "heading_aware",
    ) -> DocumentVersion:
        doc = await self.get(doc_id, actor)
        prev = await self.repo.latest_version(doc_id)
        content_hash = _hash_bytes(blob)
        if prev and prev.content_hash == content_hash:
            return prev  # idempotent — same content, return existing version

        version_num = (prev.version + 1) if prev else 1
        object_key = doc_object_key(self.tenant, doc_id, version_num)
        put_document_blob(self.tenant, doc_id, version_num, blob, mime)

        parsers = get_parser_registry()
        parser = parsers.for_filename(filename) if parser_name is None else next(
            (p for p in parsers.all() if p.name == parser_name), parsers.for_filename(filename)
        )
        ver = DocumentVersion(
            id=new_id("dvr"),
            doc_id=doc_id,
            version=version_num,
            object_key=object_key,
            mime=mime,
            size=len(blob),
            content_hash=content_hash,
            author_id=actor.id,
            parser=parser.name,
            chunker=chunker_name,
        )
        await self.repo.add_version(ver)
        doc.current_version = version_num
        doc.updated_at = utcnow()

        await get_event_bus().publish(
            DomainEvent(
                type="document.version.created",
                payload={
                    "doc_id": doc_id,
                    "version_id": ver.id,
                    "version": version_num,
                    "parser": parser.name,
                    "chunker": chunker_name,
                },
                actor=actor.id,
                tenant_id=self.tenant,
            )
        )
        return ver

    async def index_version(self, doc_version_id: str) -> int:
        """Parse → chunk → embed → persist. Runs in an arq worker, but exposed here for testability."""
        from sqlalchemy import select

        from devflow.modules.document.models import DocumentVersion as DV

        ver = (
            await self.s.execute(select(DV).where(DV.id == doc_version_id))
        ).scalar_one_or_none()
        if not ver:
            raise NotFound(f"document version {doc_version_id} not found")

        blob = get_blob(ver.object_key)
        parsers = get_parser_registry()
        parser = next(
            (p for p in parsers.all() if p.name == ver.parser),
            parsers.for_filename(ver.object_key),
        )
        parsed = parser.parse(blob, filename=ver.object_key)

        chunker = get_chunker_registry().get(ver.chunker)
        chunks = chunker.chunk(parsed)
        if not chunks:
            return 0

        embedder = get_embedder()
        embeddings = await embedder.embed([c.text for c in chunks])

        rows = [
            DocumentChunk(
                tenant_id=self.tenant,
                doc_id=ver.doc_id,
                doc_version_id=ver.id,
                seq=c.seq,
                content=c.text,
                tokens=len(c.text) // 4,
                metadata_=c.metadata,
                embedding_model=embedder.model,
                embedding=embeddings[i],
            )
            for i, c in enumerate(chunks)
        ]
        await self.repo.replace_chunks(ver.id, rows)
        ver.embedded_at = utcnow()
        return len(rows)

    async def search(
        self, query: str, actor: CurrentUser, *, mode: str = "hybrid", top_k: int = 8
    ) -> list[Hit]:
        sq = SearchQuery(text=query, tenant_id=self.tenant, actor_id=actor.id, actor_role=actor.role, top_k=top_k)
        if mode == "vector":
            hits = await VectorRetriever().search(self.s, sq)
        elif mode == "fulltext":
            hits = await FulltextRetriever().search(self.s, sq)
        else:
            hits = await HybridRetriever([VectorRetriever(), FulltextRetriever()]).search(self.s, sq)

        # ACL filter — drop chunks belonging to docs the actor cannot read.
        from devflow.modules.document.acl import readable_doc_ids

        readable = await readable_doc_ids(self.s, actor, list({h.doc_id for h in hits}))
        return [h for h in hits if h.doc_id in readable]

    async def grant(self, doc_id: str, body: GrantAclIn, actor: CurrentUser) -> DocumentAcl:
        await self.get(doc_id, actor)  # ensures read permission as a precondition
        entry = DocumentAcl(
            id=new_id("acl"),
            doc_id=doc_id,
            principal_type=body.principal_type,
            principal_id=body.principal_id,
            permission=body.permission,
        )
        await self.acls.grant(entry)
        await invalidate_doc(doc_id)
        await write_audit(
            self.s,
            tenant_id=self.tenant,
            actor_id=actor.id,
            action="document.acl.grant",
            target_type="document",
            target_id=doc_id,
            after={
                "principal": f"{body.principal_type}:{body.principal_id}",
                "permission": body.permission,
            },
        )
        return entry

    async def revoke(
        self, doc_id: str, principal_type: str, principal_id: str, actor: CurrentUser
    ) -> None:
        await self.get(doc_id, actor)
        await self.acls.revoke(doc_id, principal_type, principal_id)
        await invalidate_doc(doc_id)
        await write_audit(
            self.s,
            tenant_id=self.tenant,
            actor_id=actor.id,
            action="document.acl.revoke",
            target_type="document",
            target_id=doc_id,
            after={"principal": f"{principal_type}:{principal_id}"},
        )
