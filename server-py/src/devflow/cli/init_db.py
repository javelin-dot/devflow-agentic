from __future__ import annotations

from devflow.core.db import session_scope
from devflow.modules.iam.service import IamService


async def seed_admin_async() -> None:
    async with session_scope() as session:
        await IamService(session).ensure_seed_admin()
