from __future__ import annotations

from typing import Any

from sqlalchemy import func, select, update

from devflow.core.db import utcnow
from devflow.core.deps import AuthzDep, SessionDep, UserDep
from devflow.core.router import make_router
from devflow.modules.notification.models import Notification

router = make_router(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(user: UserDep, session: SessionDep, unread_only: bool = False) -> dict[str, Any]:
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    stmt = stmt.order_by(Notification.created_at.desc()).limit(100)
    rows = (await session.execute(stmt)).scalars().all()
    notifications = [
        {
            "id": r.id,
            "type": r.type,
            "payload": r.payload,
            "channel": r.channel,
            "readAt": r.read_at,
            "createdAt": r.created_at,
        }
        for r in rows
    ]
    unread_stmt = select(func.count()).select_from(Notification).where(
        Notification.user_id == user.id, Notification.read_at.is_(None)
    )
    unread_count = int((await session.execute(unread_stmt)).scalar_one())
    return {"notifications": notifications, "unreadCount": unread_count}


@router.post("/{notif_id}/read")
async def mark_read(notif_id: str, user: UserDep, session: SessionDep) -> dict[str, bool]:
    await session.execute(
        update(Notification)
        .where(Notification.id == notif_id, Notification.user_id == user.id)
        .values(read_at=utcnow())
    )
    return {"ok": True}


@router.post("/read-all")
async def mark_all_read(user: UserDep, session: SessionDep) -> dict[str, bool]:
    await session.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=utcnow())
    )
    return {"ok": True}
