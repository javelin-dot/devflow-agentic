from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from devflow.modules.requirement.models import Requirement, RequirementProject, SubTask


class RequirementRepository:
    def __init__(self, session: AsyncSession):
        self.s = session

    async def get(self, req_id: str) -> Requirement | None:
        stmt = (
            select(Requirement)
            .options(selectinload(Requirement.projects))
            .where(Requirement.id == req_id)
        )
        return (await self.s.execute(stmt)).scalar_one_or_none()

    async def list(
        self,
        tenant_id: str,
        *,
        stage: str | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[Requirement], int]:
        base = select(Requirement).where(Requirement.tenant_id == tenant_id)
        if stage:
            base = base.where(Requirement.stage == stage)

        total_stmt = select(func.count()).select_from(base.subquery())
        total = (await self.s.execute(total_stmt)).scalar_one()

        stmt = base.order_by(Requirement.created_at.desc()).offset(offset).limit(limit)
        items = list((await self.s.execute(stmt)).scalars().all())
        return items, int(total)

    async def add(self, req: Requirement) -> Requirement:
        self.s.add(req)
        await self.s.flush()
        return req

    async def add_project_link(self, link: RequirementProject) -> None:
        self.s.add(link)

    async def delete(self, req: Requirement) -> None:
        await self.s.delete(req)


class SubTaskRepository:
    def __init__(self, session: AsyncSession):
        self.s = session

    async def list_by_req(self, req_id: str) -> list[SubTask]:
        stmt = (
            select(SubTask)
            .where(SubTask.req_id == req_id)
            .order_by(SubTask.wave, SubTask.ordering)
        )
        return list((await self.s.execute(stmt)).scalars().all())

    async def add(self, task: SubTask) -> SubTask:
        self.s.add(task)
        await self.s.flush()
        return task
