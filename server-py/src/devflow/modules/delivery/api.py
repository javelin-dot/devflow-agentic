from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from devflow.core.deps import AuthzDep, SessionDep
from devflow.core.router import make_router
from devflow.modules.delivery.models import JenkinsTemplate, ReleaseRun

router = make_router(prefix="/delivery", tags=["delivery"])


class ReleaseRunOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    id: str
    req_id: str | None = Field(default=None, alias="reqId")
    mode: str
    state: str
    started_at: datetime = Field(alias="startedAt")
    completed_at: datetime | None = Field(default=None, alias="completedAt")


@router.get("/runs", response_model=list[ReleaseRunOut])
async def list_runs(_actor: AuthzDep, session: SessionDep) -> list[ReleaseRunOut]:
    rows = (
        await session.execute(select(ReleaseRun).order_by(ReleaseRun.started_at.desc()).limit(100))
    ).scalars().all()
    return [ReleaseRunOut.model_validate(r) for r in rows]


@router.get("/jenkins-templates")
async def list_jenkins_templates(_actor: AuthzDep, session: SessionDep) -> list[dict]:
    rows = (await session.execute(select(JenkinsTemplate))).scalars().all()
    return [
        {"id": r.id, "name": r.name, "job": r.job, "params": r.params, "jenkinsUrl": r.jenkins_url}
        for r in rows
    ]
