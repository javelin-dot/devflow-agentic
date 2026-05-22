from __future__ import annotations

import structlog

log = structlog.get_logger(__name__)


async def deliver_notification(_ctx: dict, notification_id: str) -> dict:  # type: ignore[type-arg]
    # Stub: in-app channel writes directly in service; email/IM channels would dispatch here.
    log.info("notification_delivered", notification_id=notification_id)
    return {"id": notification_id, "delivered": True}
