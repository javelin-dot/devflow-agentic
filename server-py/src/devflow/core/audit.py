"""Audit log. Every write of consequence ends up in iam.audit_log via this helper."""

from __future__ import annotations

from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from devflow.core.db import utcnow
from devflow.core.ids import new_id

log = structlog.get_logger(__name__)


async def write_audit(
    session: AsyncSession,
    *,
    tenant_id: str,
    actor_id: str | None,
    actor_role: str = "system",
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    before: Any = None,
    after: Any = None,
    request_id: str | None = None,
    ip: str | None = None,
) -> None:
    from devflow.modules.iam.models import AuditLog

    entry = AuditLog(
        id=new_id("aud"),
        tenant_id=tenant_id,
        actor_id=actor_id,
        actor_role=actor_role,
        action=action,
        target_type=target_type,
        target_id=target_id,
        before=before,
        after=after,
        request_id=request_id,
        ip=ip,
        created_at=utcnow(),
    )
    session.add(entry)
