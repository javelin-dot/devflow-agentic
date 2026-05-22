from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from devflow.modules.agent.models import Message, Session


class SessionRepository:
    def __init__(self, session: AsyncSession):
        self.s = session

    async def get(self, sid: str) -> Session | None:
        return await self.s.get(Session, sid)

    async def list(self, tenant_id: str, req_id: str | None) -> list[Session]:
        stmt = select(Session).where(Session.tenant_id == tenant_id)
        if req_id:
            stmt = stmt.where(Session.req_id == req_id)
        stmt = stmt.order_by(Session.created_at.desc())
        return list((await self.s.execute(stmt)).scalars().all())

    async def add(self, sess: Session) -> Session:
        self.s.add(sess)
        await self.s.flush()
        return sess


class MessageRepository:
    def __init__(self, session: AsyncSession):
        self.s = session

    async def list(self, session_id: str) -> list[Message]:
        stmt = select(Message).where(Message.session_id == session_id).order_by(Message.created_at)
        return list((await self.s.execute(stmt)).scalars().all())

    async def add(self, m: Message) -> Message:
        self.s.add(m)
        await self.s.flush()
        return m
