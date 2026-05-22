"""Document ACL — checked at every read. Cached in Redis to keep hot-path cost down."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from devflow.core.deps import CurrentUser
from devflow.core.redis import get_redis
from devflow.modules.document.models import DocumentAcl

_TTL = 60


async def can_read(session: AsyncSession, user: CurrentUser, doc_id: str) -> bool:
    if user.role == "admin":
        return True
    cache_key = f"acl:{doc_id}:{user.id}:read"
    r = get_redis()
    cached = await r.get(cache_key)
    if cached is not None:
        return cached == "1"

    stmt = select(DocumentAcl.id).where(
        DocumentAcl.doc_id == doc_id,
        DocumentAcl.permission.in_(["read", "write", "admin"]),
        (
            ((DocumentAcl.principal_type == "user") & (DocumentAcl.principal_id == user.id))
            | ((DocumentAcl.principal_type == "role") & (DocumentAcl.principal_id == user.role))
        ),
    )
    allowed = (await session.execute(stmt)).first() is not None
    await r.set(cache_key, "1" if allowed else "0", ex=_TTL)
    return allowed


async def readable_doc_ids(
    session: AsyncSession, user: CurrentUser, candidates: list[str]
) -> set[str]:
    if user.role == "admin":
        return set(candidates)
    stmt = select(DocumentAcl.doc_id).where(
        DocumentAcl.doc_id.in_(candidates),
        DocumentAcl.permission.in_(["read", "write", "admin"]),
        (
            ((DocumentAcl.principal_type == "user") & (DocumentAcl.principal_id == user.id))
            | ((DocumentAcl.principal_type == "role") & (DocumentAcl.principal_id == user.role))
        ),
    )
    return {row[0] for row in (await session.execute(stmt)).all()}


async def invalidate_doc(doc_id: str) -> None:
    r = get_redis()
    async for key in r.scan_iter(match=f"acl:{doc_id}:*"):
        await r.delete(key)
