from __future__ import annotations

from fastapi import File, Form, UploadFile, status
from sqlalchemy import select

from devflow.core.deps import AuthzDep, SessionDep
from devflow.core.pagination import Page, PageParams
from devflow.core.router import make_router
from devflow.core.db import utcnow
from devflow.modules.document.schemas import (
    CreateDocumentIn,
    DocumentOut,
    DocumentVersionOut,
    GrantAclIn,
    HitOut,
    SearchIn,
    SearchOut,
)
from devflow.modules.document.service import DocumentService

router = make_router(prefix="/documents", tags=["documents"])


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def create_document(
    body: CreateDocumentIn, actor: AuthzDep, session: SessionDep
) -> DocumentOut:
    doc = await DocumentService(session).create(body, actor)
    return DocumentOut.model_validate(doc)


@router.get("", response_model=list[DocumentOut] | Page[DocumentOut])
async def list_documents(
    actor: AuthzDep,
    session: SessionDep,
    type: str | None = None,
    reqId: str | None = None,
    status: str | None = None,
    paginated: bool = False,
    page: int = 1,
    size: int = 200,
) -> list[DocumentOut] | Page[DocumentOut]:
    p = PageParams(page=page, size=size)
    items, total = await DocumentService(session).list(
        actor, doc_type=type, req_id=reqId, status=status, offset=p.offset, limit=p.size
    )
    out = [DocumentOut.model_validate(d) for d in items]
    if paginated:
        return Page.of(out, total, p)
    return out


@router.get("/{doc_id}", response_model=DocumentOut)
async def get_document(doc_id: str, actor: AuthzDep, session: SessionDep) -> DocumentOut:
    from devflow.modules.document.models import DocumentVersion as DV
    from devflow.modules.document.storage import get_blob

    doc = await DocumentService(session).get(doc_id, actor)
    out = DocumentOut.model_validate(doc)
    # populate content from latest version for frontend compat
    stmt = select(DV).where(DV.doc_id == doc_id).order_by(DV.version.desc()).limit(1)  # type: ignore[arg-type]
    latest = (await session.execute(stmt)).scalar_one_or_none()
    if latest:
        try:
            out.content = get_blob(latest.object_key).decode("utf-8", errors="replace")
        except Exception:
            out.content = ""
    return out


@router.patch("/{doc_id}", response_model=DocumentOut)
async def patch_document(
    doc_id: str, body: dict, actor: AuthzDep, session: SessionDep
) -> DocumentOut:
    from devflow.modules.document.models import Document

    doc = await session.get(Document, doc_id)
    if not doc or doc.deleted_at:
        from devflow.core.errors import NotFound
        raise NotFound("document not found")
    if "title" in body:
        doc.title = body["title"]
    if "type" in body:
        doc.type = body["type"]
    if "status" in body:
        doc.status = body["status"]
    if "reqId" in body:
        doc.req_id = body["reqId"]
    doc.updated_at = utcnow()
    return DocumentOut.model_validate(doc)


@router.get("/{doc_id}/versions", response_model=list[DocumentVersionOut])
async def list_versions(
    doc_id: str, actor: AuthzDep, session: SessionDep
) -> list[DocumentVersionOut]:
    from devflow.modules.document.models import DocumentVersion as DV
    from devflow.modules.document.storage import get_blob

    doc = await DocumentService(session).get(doc_id, actor)
    stmt = (
        select(DV).where(DV.doc_id == doc_id).order_by(DV.version.desc())  # type: ignore[arg-type]
    )
    rows = (await session.execute(stmt)).scalars().all()
    out: list[DocumentVersionOut] = []
    for r in rows:
        ver = DocumentVersionOut.model_validate(r)
        # populate content from MinIO for frontend compat
        try:
            ver.content = get_blob(r.object_key).decode("utf-8", errors="replace")
        except Exception:
            ver.content = ""
        out.append(ver)
    return out


@router.post("/{doc_id}/versions", response_model=DocumentVersionOut, status_code=201)
async def upload_version(
    doc_id: str,
    actor: AuthzDep,
    session: SessionDep,
    file: UploadFile = File(...),
    chunker: str = Form("heading_aware"),
) -> DocumentVersionOut:
    data = await file.read()
    ver = await DocumentService(session).upload_version(
        doc_id,
        filename=file.filename or "untitled",
        blob=data,
        mime=file.content_type or "application/octet-stream",
        actor=actor,
        chunker_name=chunker,
    )
    return DocumentVersionOut.model_validate(ver)


@router.post("/{doc_id}/approve", response_model=DocumentOut)
async def approve_document(
    doc_id: str, actor: AuthzDep, session: SessionDep
) -> DocumentOut:
    from devflow.core.errors import Conflict
    from devflow.modules.document.models import Document

    doc = await session.get(Document, doc_id)
    if not doc or doc.deleted_at:
        from devflow.core.errors import NotFound
        raise NotFound("document not found")

    allowed = {
        "draft": ["pending_approval", "archived"],
        "pending_approval": ["approved", "rejected", "draft"],
        "approved": ["draft", "archived"],
        "rejected": ["draft", "archived"],
        "archived": ["draft"],
    }
    if "approved" not in allowed.get(doc.status, []):
        raise Conflict(f"cannot transition from {doc.status} to approved")

    doc.status = "approved"
    doc.updated_at = utcnow()
    return DocumentOut.model_validate(doc)


@router.post("/{doc_id}/reject", response_model=DocumentOut)
async def reject_document(
    doc_id: str, body: dict, actor: AuthzDep, session: SessionDep
) -> DocumentOut:
    from devflow.core.errors import Conflict
    from devflow.modules.document.models import Document, DocumentVersion as DV

    doc = await session.get(Document, doc_id)
    if not doc or doc.deleted_at:
        from devflow.core.errors import NotFound
        raise NotFound("document not found")

    allowed = {
        "draft": ["pending_approval", "archived"],
        "pending_approval": ["approved", "rejected", "draft"],
        "approved": ["draft", "archived"],
        "rejected": ["draft", "archived"],
        "archived": ["draft"],
    }
    if "rejected" not in allowed.get(doc.status, []):
        raise Conflict(f"cannot transition from {doc.status} to rejected")

    doc.status = "rejected"
    doc.updated_at = utcnow()

    reason = body.get("reason", "")
    if reason:
        stmt = (
            select(DV).where(DV.doc_id == doc_id).order_by(DV.version.desc()).limit(1)  # type: ignore[arg-type]
        )
        latest = (await session.execute(stmt)).scalar_one_or_none()
        if latest:
            latest.summary = (latest.summary or "") + f"\n[REJECTED]: {reason}"

    return DocumentOut.model_validate(doc)


@router.post("/search", response_model=SearchOut)
async def search(body: SearchIn, actor: AuthzDep, session: SessionDep) -> SearchOut:
    hits = await DocumentService(session).search(body.query, actor, mode=body.mode, top_k=body.top_k)
    return SearchOut(
        mode=body.mode,
        hits=[
            HitOut(
                chunkId=h.chunk_id,
                docId=h.doc_id,
                docVersionId=h.doc_version_id,
                seq=h.seq,
                content=h.content,
                score=h.score,
                source=h.source,
                metadata=h.metadata,
            )
            for h in hits
        ],
    )


@router.post("/{doc_id}/acl", status_code=201)
async def grant_acl(
    doc_id: str, body: GrantAclIn, actor: AuthzDep, session: SessionDep
) -> dict[str, str]:
    entry = await DocumentService(session).grant(doc_id, body, actor)
    return {"id": entry.id}


@router.delete("/{doc_id}/acl/{principal_type}/{principal_id}")
async def revoke_acl(
    doc_id: str,
    principal_type: str,
    principal_id: str,
    actor: AuthzDep,
    session: SessionDep,
) -> dict[str, bool]:
    await DocumentService(session).revoke(doc_id, principal_type, principal_id, actor)
    return {"ok": True}
