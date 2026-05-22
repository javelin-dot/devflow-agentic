from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from devflow.config import get_settings
from devflow.core.audit import write_audit
from devflow.core.db import utcnow
from devflow.core.errors import NotFound, StageGateViolation
from devflow.core.events import DomainEvent, get_event_bus
from devflow.core.ids import new_id
from devflow.modules.requirement.models import (
    Event,
    Requirement,
    RequirementProject,
)
from devflow.modules.requirement.repository import RequirementRepository, SubTaskRepository
from devflow.modules.requirement.schemas import (
    CreateRequirementIn,
    PatchRequirementIn,
    TransitionStageIn,
)
from devflow.modules.requirement.seq import next_req_id
from devflow.modules.requirement.stage_gates import can_transition


class RequirementService:
    def __init__(self, session: AsyncSession):
        self.s = session
        self.reqs = RequirementRepository(session)
        self.tasks = SubTaskRepository(session)
        self.tenant = get_settings().default_tenant

    async def create(self, body: CreateRequirementIn, actor_id: str | None) -> Requirement:
        rid = await next_req_id(self.s)
        req = Requirement(
            id=rid,
            tenant_id=self.tenant,
            title=body.title,
            description=body.description,
            kind=body.kind,
            priority=body.priority,
            workspace=body.workspace,
            tags=body.tags,
            stage="backlog",
        )
        await self.reqs.add(req)
        for i, p in enumerate(body.projects):
            await self.reqs.add_project_link(
                RequirementProject(req_id=rid, project=p, is_primary=(i == 0))
            )
        await self._log_event(rid, "requirement.created", {"title": body.title}, actor_id)
        await write_audit(
            self.s,
            tenant_id=self.tenant,
            actor_id=actor_id,
            action="requirement.create",
            target_type="requirement",
            target_id=rid,
            after={"title": body.title, "stage": "backlog"},
        )
        await get_event_bus().publish(
            DomainEvent(
                type="requirement.created",
                payload={"req_id": rid, "title": body.title},
                actor=actor_id,
                tenant_id=self.tenant,
            )
        )
        return req

    async def get(self, req_id: str) -> Requirement:
        req = await self.reqs.get(req_id)
        if not req:
            raise NotFound(f"requirement {req_id} not found")
        return req

    async def list(self, *, stage: str | None, offset: int, limit: int) -> tuple[list[Requirement], int]:
        return await self.reqs.list(self.tenant, stage=stage, offset=offset, limit=limit)

    async def patch(self, req_id: str, body: PatchRequirementIn, actor_id: str | None) -> Requirement:
        req = await self.get(req_id)
        before = {
            "title": req.title,
            "priority": req.priority,
            "tags": req.tags,
        }
        for field in ("title", "description", "priority", "workspace", "notes"):
            v = getattr(body, field)
            if v is not None:
                setattr(req, field, v)
        if body.tags is not None:
            req.tags = body.tags
        if body.planned_release_date is not None:
            req.planned_release_date = body.planned_release_date
        if body.projects is not None:
            req.projects.clear()
            for i, p in enumerate(body.projects):
                req.projects.append(
                    RequirementProject(
                        req_id=req_id,
                        project=p.project,
                        dev_branch=p.dev_branch,
                        uat_branch=p.uat_branch,
                        is_primary=p.is_primary if i > 0 else True,
                    )
                )
        if body.stage is not None and body.stage != req.stage:
            decision = can_transition(req.stage, body.stage)
            if not decision.allowed:
                raise StageGateViolation(decision.reason)
            from_stage = req.stage
            req.stage = body.stage
            if body.stage == "released":
                req.released_at = utcnow()
            await get_event_bus().publish(
                DomainEvent(
                    type="requirement.stage.changed",
                    payload={"req_id": req_id, "from": from_stage, "to": body.stage},
                    actor=actor_id or "system",
                    tenant_id=self.tenant,
                )
            )
            await write_audit(
                self.s,
                tenant_id=self.tenant,
                actor_id=actor_id,
                action="stage.transitioned",
                target_type="requirement",
                target_id=req_id,
                before={"stage": from_stage},
                after={"stage": body.stage},
            )
        await self.s.flush()
        await write_audit(
            self.s,
            tenant_id=self.tenant,
            actor_id=actor_id,
            action="requirement.update",
            target_type="requirement",
            target_id=req_id,
            before=before,
            after={"title": req.title, "priority": req.priority, "tags": req.tags},
        )
        return req

    async def transition(
        self, req_id: str, body: TransitionStageIn, actor_id: str | None
    ) -> Requirement:
        req = await self.get(req_id)
        decision = can_transition(req.stage, body.to_stage)
        if not decision.allowed:
            raise StageGateViolation(decision.reason)
        from_stage = req.stage
        req.stage = body.to_stage
        if body.to_stage == "released":
            req.released_at = utcnow()
        await self.s.flush()
        await self._log_event(
            req_id,
            "stage.transitioned",
            {"from": from_stage, "to": body.to_stage, "reason": body.reason},
            actor_id,
        )
        await write_audit(
            self.s,
            tenant_id=self.tenant,
            actor_id=actor_id,
            action="requirement.transition",
            target_type="requirement",
            target_id=req_id,
            before={"stage": from_stage},
            after={"stage": body.to_stage},
        )
        await get_event_bus().publish(
            DomainEvent(
                type="requirement.transitioned",
                payload={"req_id": req_id, "from": from_stage, "to": body.to_stage},
                actor=actor_id,
                tenant_id=self.tenant,
            )
        )
        return req

    async def set_archived(self, req_id: str, archived: bool, actor_id: str | None) -> Requirement:
        req = await self.get(req_id)
        before = {"archived_at": req.archived_at}
        req.archived_at = utcnow() if archived else None
        await self.s.flush()
        await write_audit(
            self.s,
            tenant_id=self.tenant,
            actor_id=actor_id,
            action="requirement.archive" if archived else "requirement.unarchive",
            target_type="requirement",
            target_id=req_id,
            before=before,
            after={"archived_at": req.archived_at},
        )
        return req

    async def delete(self, req_id: str, actor_id: str | None) -> None:
        req = await self.reqs.get(req_id)
        if not req:
            return
        await self.reqs.delete(req)
        await write_audit(
            self.s,
            tenant_id=self.tenant,
            actor_id=actor_id,
            action="requirement.delete",
            target_type="requirement",
            target_id=req_id,
        )

    async def _log_event(
        self, req_id: str | None, event_type: str, payload: dict, actor_id: str | None
    ) -> None:
        self.s.add(
            Event(
                id=new_id("evt"),
                tenant_id=self.tenant,
                req_id=req_id,
                type=event_type,
                payload=payload,
                actor=actor_id or "system",
                actor_role="user" if actor_id else "system",
                target_type="requirement",
                target_id=req_id,
            )
        )
