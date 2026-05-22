from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from devflow.modules.iam.models import User


class UserRepository:
    def __init__(self, session: AsyncSession):
        self.s = session

    async def get_by_id(self, user_id: str) -> User | None:
        return await self.s.get(User, user_id)

    async def get_by_username(self, tenant_id: str, username: str) -> User | None:
        stmt = select(User).where(User.tenant_id == tenant_id, User.username == username)
        return (await self.s.execute(stmt)).scalar_one_or_none()

    async def list_all(self, tenant_id: str) -> list[User]:
        stmt = select(User).where(User.tenant_id == tenant_id).order_by(User.created_at.desc())
        return list((await self.s.execute(stmt)).scalars().all())

    async def add(self, user: User) -> User:
        self.s.add(user)
        await self.s.flush()
        return user

    async def delete(self, user: User) -> None:
        await self.s.delete(user)
