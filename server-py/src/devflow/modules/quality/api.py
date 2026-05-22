from __future__ import annotations

from sqlalchemy import select

from devflow.core.deps import AuthzDep, SessionDep
from devflow.core.router import make_router
from devflow.modules.quality.models import Defect, TestPlan, TestRun

router = make_router(prefix="/quality", tags=["quality"])


@router.get("/plans")
async def list_plans(_actor: AuthzDep, session: SessionDep, req_id: str | None = None) -> list[dict]:
    stmt = select(TestPlan)
    if req_id:
        stmt = stmt.where(TestPlan.req_id == req_id)
    stmt = stmt.order_by(TestPlan.created_at.desc())
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {"id": r.id, "reqId": r.req_id, "title": r.title, "status": r.status} for r in rows
    ]


@router.get("/runs")
async def list_runs(_actor: AuthzDep, session: SessionDep, req_id: str | None = None) -> list[dict]:
    stmt = select(TestRun)
    if req_id:
        stmt = stmt.where(TestRun.req_id == req_id)
    stmt = stmt.order_by(TestRun.started_at.desc()).limit(100)
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "id": r.id,
            "reqId": r.req_id,
            "status": r.status,
            "total": r.total,
            "passed": r.passed,
            "failed": r.failed,
            "skipped": r.skipped,
            "startedAt": r.started_at,
            "completedAt": r.completed_at,
        }
        for r in rows
    ]


@router.get("/defects")
async def list_defects(
    _actor: AuthzDep, session: SessionDep, req_id: str | None = None, status: str | None = None
) -> list[dict]:
    stmt = select(Defect)
    if req_id:
        stmt = stmt.where(Defect.req_id == req_id)
    if status:
        stmt = stmt.where(Defect.status == status)
    stmt = stmt.order_by(Defect.updated_at.desc()).limit(200)
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "id": r.id,
            "reqId": r.req_id,
            "title": r.title,
            "severity": r.severity,
            "status": r.status,
        }
        for r in rows
    ]
