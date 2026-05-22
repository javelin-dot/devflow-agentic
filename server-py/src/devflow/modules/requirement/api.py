from __future__ import annotations

from typing import Annotated

from fastapi import Query, status

from devflow.core.deps import AuthzDep, SessionDep
from devflow.core.pagination import Page, PageParams
from devflow.core.router import make_router
from devflow.modules.requirement.schemas import (
    CreateRequirementIn,
    PatchRequirementIn,
    RequirementOut,
    SubTaskOut,
    TransitionStageIn,
)
from devflow.modules.requirement.service import RequirementService

router = make_router(prefix="/requirements", tags=["requirements"])


@router.post("", response_model=RequirementOut, status_code=status.HTTP_201_CREATED)
async def create_requirement(
    body: CreateRequirementIn, actor: AuthzDep, session: SessionDep
) -> RequirementOut:
    req = await RequirementService(session).create(body, actor_id=actor.id)
    return RequirementOut.model_validate(req)


@router.get("", response_model=list[RequirementOut] | Page[RequirementOut])
async def list_requirements(
    actor: AuthzDep,
    session: SessionDep,
    stage: Annotated[str | None, Query()] = None,
    priority: Annotated[str | None, Query()] = None,
    archived: Annotated[str | None, Query()] = None,
    paginated: Annotated[bool, Query()] = False,
    page: int = 1,
    size: int = 200,
) -> list[RequirementOut] | Page[RequirementOut]:
    """Returns a flat array by default (matches legacy frontend hooks).
    Pass ?paginated=true to get {items, total, page, size}."""
    p = PageParams(page=page, size=size)
    items, total = await RequirementService(session).list(stage=stage, offset=p.offset, limit=p.size)
    # priority/archived filters applied in-memory until repo supports them — fine for S-tier scale.
    if priority:
        items = [r for r in items if r.priority == priority]
    if archived == "1":
        items = [r for r in items if r.archived_at is not None]
    elif archived == "0" or archived is None:
        items = [r for r in items if r.archived_at is None]
    out = [RequirementOut.model_validate(r) for r in items]
    if paginated:
        return Page.of(out, total, p)
    return out


@router.get("/{req_id}", response_model=RequirementOut)
async def get_requirement(req_id: str, _actor: AuthzDep, session: SessionDep) -> RequirementOut:
    req = await RequirementService(session).get(req_id)
    return RequirementOut.model_validate(req)


@router.patch("/{req_id}", response_model=RequirementOut)
async def patch_requirement(
    req_id: str, body: PatchRequirementIn, actor: AuthzDep, session: SessionDep
) -> RequirementOut:
    req = await RequirementService(session).patch(req_id, body, actor_id=actor.id)
    return RequirementOut.model_validate(req)


@router.post("/{req_id}/transition", response_model=RequirementOut)
async def transition(
    req_id: str, body: TransitionStageIn, actor: AuthzDep, session: SessionDep
) -> RequirementOut:
    req = await RequirementService(session).transition(req_id, body, actor_id=actor.id)
    return RequirementOut.model_validate(req)


@router.delete("/{req_id}")
async def delete_requirement(
    req_id: str, actor: AuthzDep, session: SessionDep
) -> dict[str, bool]:
    await RequirementService(session).delete(req_id, actor_id=actor.id)
    return {"ok": True}


@router.post("/{req_id}/archive", response_model=RequirementOut)
async def archive_requirement(
    req_id: str, actor: AuthzDep, session: SessionDep
) -> RequirementOut:
    req = await RequirementService(session).set_archived(req_id, True, actor_id=actor.id)
    return RequirementOut.model_validate(req)


@router.post("/{req_id}/unarchive", response_model=RequirementOut)
async def unarchive_requirement(
    req_id: str, actor: AuthzDep, session: SessionDep
) -> RequirementOut:
    req = await RequirementService(session).set_archived(req_id, False, actor_id=actor.id)
    return RequirementOut.model_validate(req)


@router.get("/{req_id}/subtasks", response_model=list[SubTaskOut])
async def list_subtasks(req_id: str, _actor: AuthzDep, session: SessionDep) -> list[SubTaskOut]:
    from devflow.modules.requirement.repository import SubTaskRepository

    tasks = await SubTaskRepository(session).list_by_req(req_id)
    return [SubTaskOut.model_validate(t) for t in tasks]
