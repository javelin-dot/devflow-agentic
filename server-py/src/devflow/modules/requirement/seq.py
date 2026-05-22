"""6-digit auto-incrementing requirement number. Allocated transactionally."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from devflow.core.ids import format_req_id
from devflow.modules.requirement.models import ReqSequence


async def next_req_id(session: AsyncSession) -> str:
    row = await session.get(ReqSequence, 1, with_for_update=True)
    if row is None:
        row = ReqSequence(id=1, next_val=1)
        session.add(row)
    else:
        row.next_val += 1
    await session.flush()
    return format_req_id(row.next_val)
