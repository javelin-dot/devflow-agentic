"""Legacy path compat layer.

The frontend's existing TypeScript hooks call flat paths like /sessions, /test-plans, /defects, /release/list.
The new backend organises routes under module prefixes (/agent/sessions, /quality/defects, ...).

Rather than rewrite ~70 frontend hooks in one pass, this module re-exposes the most-used
legacy paths as thin wrappers around the new services. Remove an alias once the frontend
hook for that path has been updated to the new module path.
"""

from __future__ import annotations

from fastapi import File, UploadFile
from sqlalchemy import func, select, update

from devflow.config import get_settings
from devflow.core.db import utcnow
from devflow.core.deps import AuthzDep, SessionDep, UserDep
from devflow.core.ids import new_id
from devflow.core.router import make_router
from devflow.core.storage import delete_object, put_bytes
from devflow.modules.agent.models import Message, Session
from devflow.modules.agent.schemas import (
    ChatIn,
    CreateSessionIn,
    MessageOut,
    SessionOut,
)
from devflow.modules.agent.service import AgentService
from devflow.modules.delivery.models import JenkinsTemplate, LogTarget, ReleaseRun
from devflow.modules.document.models import Attachment
from devflow.modules.document.storage import attachment_object_key
from devflow.modules.notification.models import Notification
from devflow.modules.quality.models import (
    Defect,
    DefectStatusHistory,
    GateCheck,
    TestCase,
    TestPlan,
    TestRun,
)
from devflow.modules.requirement.models import Analysis, Event, Project, SubTask

router = make_router(tags=["legacy-compat"])


# ===== sessions (flat) → agent.sessions =====


@router.post("/sessions", response_model=SessionOut, status_code=201)
async def legacy_create_session(
    body: CreateSessionIn, actor: AuthzDep, session: SessionDep
) -> SessionOut:
    s = await AgentService(session).create_session(body, actor)
    return SessionOut.model_validate(s)


@router.get("/sessions", response_model=list[SessionOut])
async def legacy_list_sessions(
    _actor: AuthzDep, session: SessionDep, reqId: str | None = None
) -> list[SessionOut]:
    rows = await AgentService(session).list_sessions(reqId)
    return [SessionOut.model_validate(s) for s in rows]


@router.get("/sessions/by-req/{req_id}", response_model=list[SessionOut])
async def legacy_sessions_by_req(
    req_id: str, _actor: AuthzDep, session: SessionDep
) -> list[SessionOut]:
    rows = await AgentService(session).list_sessions(req_id)
    return [SessionOut.model_validate(s) for s in rows]


@router.get("/sessions/{sid}", response_model=SessionOut)
async def legacy_get_session(sid: str, _actor: AuthzDep, session: SessionDep) -> SessionOut:
    s = await session.get(Session, sid)
    if not s:
        from devflow.core.errors import NotFound

        raise NotFound("session not found")
    return SessionOut.model_validate(s)


@router.delete("/sessions/{sid}")
async def legacy_delete_session(sid: str, _actor: AuthzDep, session: SessionDep) -> dict[str, bool]:
    s = await session.get(Session, sid)
    if s:
        await session.delete(s)
    return {"ok": True}


@router.get("/sessions/{sid}/messages", response_model=list[MessageOut])
async def legacy_list_messages(
    sid: str, _actor: AuthzDep, session: SessionDep
) -> list[MessageOut]:
    rows = await AgentService(session).history(sid)
    return [MessageOut.model_validate(m) for m in rows]


@router.post("/sessions/{sid}/messages", response_model=MessageOut)
async def legacy_post_message(
    sid: str, body: ChatIn, actor: AuthzDep, session: SessionDep
) -> MessageOut:
    m = await AgentService(session).chat_once(sid, body, actor)
    return MessageOut.model_validate(m)


@router.delete("/sessions/{sid}/messages/{mid}")
async def legacy_delete_message(
    sid: str, mid: str, _actor: AuthzDep, session: SessionDep
) -> dict[str, bool]:
    m = await session.get(Message, mid)
    if m and m.session_id == sid:
        await session.delete(m)
    return {"ok": True}


@router.delete("/sessions/{sid}/messages")
async def legacy_delete_messages(
    sid: str, body: dict, _actor: AuthzDep, session: SessionDep
) -> dict[str, bool | int]:
    ids = body.get("ids", [])
    deleted = 0
    for mid in ids:
        m = await session.get(Message, mid)
        if m and m.session_id == sid:
            await session.delete(m)
            deleted += 1
    return {"ok": True, "deleted": deleted}


@router.patch("/sessions/{sid}", response_model=SessionOut)
async def legacy_patch_session(
    sid: str, body: dict, _actor: AuthzDep, session: SessionDep
) -> SessionOut:
    s = await session.get(Session, sid)
    if not s:
        from devflow.core.errors import NotFound
        raise NotFound("session not found")
    if "title" in body:
        s.title = body["title"]
    if "profileId" in body:
        s.profile_id = body["profileId"]
    return SessionOut.model_validate(s)


@router.post("/sessions/{sid}/archive", response_model=SessionOut)
async def legacy_archive_session(
    sid: str, _actor: AuthzDep, session: SessionDep
) -> SessionOut:
    s = await session.get(Session, sid)
    if not s:
        from devflow.core.errors import NotFound
        raise NotFound("session not found")
    s.archived_at = utcnow()
    s.status = "archived"
    return SessionOut.model_validate(s)


@router.post("/sessions/{sid}/unarchive", response_model=SessionOut)
async def legacy_unarchive_session(
    sid: str, _actor: AuthzDep, session: SessionDep
) -> SessionOut:
    s = await session.get(Session, sid)
    if not s:
        from devflow.core.errors import NotFound
        raise NotFound("session not found")
    s.archived_at = None
    s.status = "active"
    return SessionOut.model_validate(s)


# ===== events (flat) → requirement.events =====


@router.get("/events")
async def legacy_list_events(
    _actor: AuthzDep, session: SessionDep, limit: int = 100
) -> list[dict]:
    stmt = select(Event).order_by(Event.created_at.desc()).limit(limit)
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "id": r.id,
            "reqId": r.req_id,
            "type": r.type,
            "payload": r.payload,
            "actor": r.actor,
            "actorRole": r.actor_role,
            "targetType": r.target_type,
            "targetId": r.target_id,
            "createdAt": r.created_at,
        }
        for r in rows
    ]


@router.get("/events/by-req/{req_id}")
async def legacy_events_by_req(
    req_id: str, _actor: AuthzDep, session: SessionDep, limit: int = 100
) -> list[dict]:
    stmt = (
        select(Event).where(Event.req_id == req_id).order_by(Event.created_at.desc()).limit(limit)
    )
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "id": r.id,
            "reqId": r.req_id,
            "type": r.type,
            "payload": r.payload,
            "actor": r.actor,
            "actorRole": r.actor_role,
            "createdAt": r.created_at,
        }
        for r in rows
    ]


# ===== notifications extras =====


@router.get("/notifications/unread-count")
async def legacy_unread_count(user: UserDep, session: SessionDep) -> dict[str, int]:
    stmt = select(func.count()).select_from(Notification).where(
        Notification.user_id == user.id, Notification.read_at.is_(None)
    )
    n = (await session.execute(stmt)).scalar_one()
    return {"count": int(n)}


# ===== quality (flat) → quality.* =====


@router.get("/test-plans")
async def legacy_test_plans(
    _actor: AuthzDep, session: SessionDep, reqId: str | None = None
) -> list[dict]:
    stmt = select(TestPlan)
    if reqId:
        stmt = stmt.where(TestPlan.req_id == reqId)
    stmt = stmt.order_by(TestPlan.created_at.desc())
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {"id": r.id, "reqId": r.req_id, "title": r.title, "status": r.status, "createdAt": r.created_at}
        for r in rows
    ]


@router.get("/test-cases")
async def legacy_test_cases(
    _actor: AuthzDep, session: SessionDep, reqId: str | None = None, planId: str | None = None
) -> list[dict]:
    stmt = select(TestCase)
    if reqId:
        stmt = stmt.where(TestCase.req_id == reqId)
    if planId:
        stmt = stmt.where(TestCase.plan_id == planId)
    stmt = stmt.order_by(TestCase.created_at.desc())
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "id": r.id,
            "planId": r.plan_id,
            "reqId": r.req_id,
            "title": r.title,
            "testType": r.test_type,
            "status": r.status,
            "command": r.command,
        }
        for r in rows
    ]


@router.get("/test-runs")
async def legacy_test_runs(
    _actor: AuthzDep, session: SessionDep, reqId: str | None = None
) -> list[dict]:
    stmt = select(TestRun)
    if reqId:
        stmt = stmt.where(TestRun.req_id == reqId)
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


@router.get("/gate-checks")
async def legacy_gate_checks(
    _actor: AuthzDep, session: SessionDep, reqId: str | None = None
) -> list[dict]:
    stmt = select(GateCheck)
    if reqId:
        stmt = stmt.where(GateCheck.req_id == reqId)
    stmt = stmt.order_by(GateCheck.created_at.desc())
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "id": r.id,
            "reqId": r.req_id,
            "fromStage": r.from_stage,
            "toStage": r.to_stage,
            "checkType": r.check_type,
            "result": r.result,
            "detail": r.detail,
            "createdAt": r.created_at,
        }
        for r in rows
    ]


@router.get("/defects")
async def legacy_defects(
    _actor: AuthzDep, session: SessionDep, reqId: str | None = None, status: str | None = None
) -> list[dict]:
    stmt = select(Defect)
    if reqId:
        stmt = stmt.where(Defect.req_id == reqId)
    if status:
        stmt = stmt.where(Defect.status == status)
    stmt = stmt.order_by(Defect.updated_at.desc()).limit(200)
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "id": r.id,
            "reqId": r.req_id,
            "subTaskId": r.sub_task_id,
            "testRunId": r.test_run_id,
            "title": r.title,
            "description": r.description,
            "severity": r.severity,
            "status": r.status,
            "createdAt": r.created_at,
            "updatedAt": r.updated_at,
        }
        for r in rows
    ]


# ===== delivery (flat) → delivery.* =====


@router.get("/release/list")
async def legacy_release_list(_actor: AuthzDep, session: SessionDep) -> list[dict]:
    rows = (
        (await session.execute(select(ReleaseRun).order_by(ReleaseRun.started_at.desc()).limit(100)))
        .scalars()
        .all()
    )
    return [
        {
            "id": r.id,
            "reqId": r.req_id,
            "mode": r.mode,
            "state": r.state,
            "verdict": r.verdict,
            "startedAt": r.started_at,
            "completedAt": r.completed_at,
        }
        for r in rows
    ]


@router.get("/release/by-req/{req_id}")
async def legacy_release_by_req(
    req_id: str, _actor: AuthzDep, session: SessionDep
) -> list[dict]:
    rows = (
        (
            await session.execute(
                select(ReleaseRun)
                .where(ReleaseRun.req_id == req_id)
                .order_by(ReleaseRun.started_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [
        {
            "id": r.id,
            "reqId": r.req_id,
            "mode": r.mode,
            "state": r.state,
            "verdict": r.verdict,
            "startedAt": r.started_at,
            "completedAt": r.completed_at,
        }
        for r in rows
    ]


@router.get("/jenkins-templates")
async def legacy_jenkins_templates(_actor: AuthzDep, session: SessionDep) -> list[dict]:
    rows = (await session.execute(select(JenkinsTemplate))).scalars().all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "job": r.job,
            "params": r.params,
            "jenkinsUrl": r.jenkins_url,
            "createdAt": r.created_at,
        }
        for r in rows
    ]


# ===== sub_tasks (flat) → requirement.sub_tasks =====


@router.get("/subtasks/by-req/{req_id}")
async def legacy_subtasks_by_req(
    req_id: str, _actor: AuthzDep, session: SessionDep
) -> list[dict]:
    from devflow.modules.requirement.repository import SubTaskRepository

    tasks = await SubTaskRepository(session).list_by_req(req_id)
    return [
        {
            "id": t.id,
            "reqId": t.req_id,
            "analysisId": t.analysis_id,
            "title": t.title,
            "prompt": t.prompt,
            "project": t.project,
            "type": t.type,
            "wave": t.wave,
            "taskDependsOn": t.task_depends_on,
            "acceptance": t.acceptance,
            "verifyCommands": t.verify_commands,
            "risk": t.risk,
            "status": t.status,
            "sessionId": t.session_id,
            "agent": t.agent,
            "errorMessage": t.error_message,
            "notes": t.notes,
            "ordering": t.ordering,
            "createdAt": t.created_at,
            "startedAt": t.started_at,
            "completedAt": t.completed_at,
        }
        for t in tasks
    ]


# ===== health / runtime placeholders (frontend probes these on boot) =====


@router.get("/runtime/state")
async def legacy_runtime_state() -> dict:
    """Feature flags. New backend defaults: gate check, RAG, document ACL all on; verify endpoints off (legacy)."""
    return {
        "version": "0.1.0",
        "features": {
            "ragSearch": True,
            "documentAcl": True,
            "stageGates": True,
            "qualityGateCheck": False,
            "subtaskVerify": False,
            "runs": False,
        },
    }


@router.get("/agent/availability")
async def legacy_agent_availability() -> dict:
    from devflow.config import get_settings

    s = get_settings()
    agents: dict[str, dict[str, object]] = {}
    default_agent: str | None = None
    if s.anthropic_api_key:
        agents["claude"] = {"present": True}
        default_agent = "claude"
    if s.openai_api_key:
        agents["openai"] = {"present": True}
        if default_agent is None:
            default_agent = "openai"
    return {
        "agents": agents,
        "defaultAgent": default_agent,
    }


@router.get("/stats")
async def legacy_stats(_actor: AuthzDep, session: SessionDep) -> dict:
    from devflow.modules.document.models import Document
    from devflow.modules.quality.models import Defect
    from devflow.modules.requirement.models import Requirement

    req_count = (await session.execute(select(func.count()).select_from(Requirement))).scalar_one()
    doc_count = (await session.execute(select(func.count()).select_from(Document))).scalar_one()
    sess_count = (await session.execute(select(func.count()).select_from(Session))).scalar_one()
    open_defects = (
        await session.execute(
            select(func.count()).select_from(Defect).where(Defect.status.in_(("pending_confirm", "to_fix", "to_regress")))
        )
    ).scalar_one()

    # group by stage
    stage_stmt = select(Requirement.stage, func.count()).group_by(Requirement.stage)
    stage_rows = (await session.execute(stage_stmt)).all()
    by_stage: dict[str, int] = {r[0]: int(r[1]) for r in stage_rows}

    return {
        "byStage": by_stage,
        "totalRequirements": int(req_count),
        "openDefects": int(open_defects),
        "weeklyThroughput": 0,
        "avgCycleDays": 0,
    }


# ===== attachments (flat) → document.attachments =====


@router.get("/requirements/{req_id}/attachments")
async def legacy_req_attachments(req_id: str, _actor: AuthzDep, session: SessionDep) -> dict:
    stmt = select(Attachment).where(Attachment.req_id == req_id).order_by(Attachment.created_at.desc())
    rows = (await session.execute(stmt)).scalars().all()
    files = [{"name": r.filename, "size": r.size} for r in rows]
    return {"files": files}


@router.post("/requirements/{req_id}/attachments")
async def legacy_req_attachments_upload(
    req_id: str, _actor: AuthzDep, session: SessionDep, file: list[UploadFile] = File(...)
) -> dict:
    s = get_settings()
    uploaded: list[str] = []
    for f in file:
        data = await f.read()
        att_id = new_id("att")
        key = attachment_object_key(s.default_tenant, req_id, att_id, f.filename or "untitled")
        put_bytes(key, data, content_type=f.content_type or "application/octet-stream")
        att = Attachment(
            id=att_id,
            tenant_id=s.default_tenant,
            req_id=req_id,
            filename=f.filename or "untitled",
            mime=f.content_type,
            size=len(data),
            object_key=key,
        )
        session.add(att)
        uploaded.append(f.filename or "untitled")
    return {"ok": True, "uploaded": uploaded}


@router.delete("/requirements/{req_id}/attachments/{filename}")
async def legacy_req_attachments_delete(
    req_id: str, filename: str, _actor: AuthzDep, session: SessionDep
) -> dict:
    stmt = select(Attachment).where(Attachment.req_id == req_id, Attachment.filename == filename)
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row:
        delete_object(row.object_key)
        await session.delete(row)
    return {"ok": True}


# ===== attachments v2 =====


def _attachment_out(r: Attachment) -> dict:
    return {
        "id": r.id,
        "reqId": r.req_id,
        "filename": r.filename,
        "mime": r.mime,
        "size": r.size,
        "sha256": r.sha256,
        "uploadedBy": r.uploaded_by,
        "storagePath": r.object_key,
        "createdAt": r.created_at,
    }


@router.get("/attachments")
async def legacy_attachments_v2(
    _actor: AuthzDep, session: SessionDep, reqId: str | None = None
) -> list[dict]:
    stmt = select(Attachment)
    if reqId:
        stmt = stmt.where(Attachment.req_id == reqId)
    stmt = stmt.order_by(Attachment.created_at.desc())
    rows = (await session.execute(stmt)).scalars().all()
    return [_attachment_out(r) for r in rows]


@router.post("/attachments")
async def legacy_attachments_v2_upload(
    _actor: AuthzDep,
    session: SessionDep,
    reqId: str | None = None,
    file: list[UploadFile] = File(...),
) -> dict:
    if not reqId:
        from devflow.core.errors import BadRequest
        raise BadRequest("reqId required")
    s = get_settings()
    uploaded: list[dict] = []
    errors: list[str] = []
    for f in file:
        data = await f.read()
        att_id = new_id("att")
        key = attachment_object_key(s.default_tenant, reqId, att_id, f.filename or "untitled")
        put_bytes(key, data, content_type=f.content_type or "application/octet-stream")
        att = Attachment(
            id=att_id,
            tenant_id=s.default_tenant,
            req_id=reqId,
            filename=f.filename or "untitled",
            mime=f.content_type,
            size=len(data),
            object_key=key,
        )
        session.add(att)
        uploaded.append(_attachment_out(att))
    return {"uploaded": uploaded, "errors": errors, "count": len(uploaded)}


@router.delete("/attachments/{att_id}")
async def legacy_attachments_v2_delete(
    att_id: str, _actor: AuthzDep, session: SessionDep
) -> dict:
    att = await session.get(Attachment, att_id)
    if att:
        delete_object(att.object_key)
        await session.delete(att)
    return {"ok": True}


# ===== subtasks write ops =====


@router.post("/subtasks")
async def legacy_create_subtask(
    body: dict, _actor: AuthzDep, session: SessionDep
) -> dict:
    id = new_id("stk")
    now = utcnow()
    task = SubTask(
        id=id,
        req_id=body["reqId"],
        analysis_id=body.get("analysisId"),
        title=body["title"],
        prompt=body.get("prompt", ""),
        project=body.get("project"),
        type=body.get("type", "impl"),
        wave=body.get("wave", 0),
        task_depends_on=body.get("taskDependsOn", []),
        acceptance=body.get("acceptance", []),
        verify_commands=body.get("verifyCommands", []),
        risk=body.get("risk"),
        status="pending",
        ordering=body.get("ordering", 0),
        created_at=now,
    )
    session.add(task)
    return {
        "id": task.id,
        "reqId": task.req_id,
        "analysisId": task.analysis_id,
        "title": task.title,
        "prompt": task.prompt,
        "project": task.project,
        "type": task.type,
        "wave": task.wave,
        "taskDependsOn": task.task_depends_on,
        "acceptance": task.acceptance,
        "verifyCommands": task.verify_commands,
        "risk": task.risk,
        "status": task.status,
        "sessionId": task.session_id,
        "agent": task.agent,
        "errorMessage": task.error_message,
        "notes": task.notes,
        "ordering": task.ordering,
        "createdAt": task.created_at,
        "startedAt": task.started_at,
        "completedAt": task.completed_at,
    }


@router.patch("/subtasks/{task_id}")
async def legacy_patch_subtask(
    task_id: str, body: dict, _actor: AuthzDep, session: SessionDep
) -> dict:
    task = await session.get(SubTask, task_id)
    if not task:
        from devflow.core.errors import NotFound
        raise NotFound("subtask not found")
    if "status" in body:
        task.status = body["status"]
    if "startedAt" in body:
        task.started_at = body["startedAt"]
    if "completedAt" in body:
        task.completed_at = body["completedAt"]
    if "errorMessage" in body:
        task.error_message = body["errorMessage"]
    if "sessionId" in body:
        task.session_id = body["sessionId"]
    if "agent" in body:
        task.agent = body["agent"]
    if "notes" in body:
        task.notes = body["notes"]
    if "title" in body:
        task.title = body["title"]
    if "prompt" in body:
        task.prompt = body["prompt"]
    if "wave" in body:
        task.wave = body["wave"]
    if "ordering" in body:
        task.ordering = body["ordering"]
    return {
        "id": task.id,
        "reqId": task.req_id,
        "analysisId": task.analysis_id,
        "title": task.title,
        "prompt": task.prompt,
        "project": task.project,
        "type": task.type,
        "wave": task.wave,
        "taskDependsOn": task.task_depends_on,
        "acceptance": task.acceptance,
        "verifyCommands": task.verify_commands,
        "risk": task.risk,
        "status": task.status,
        "sessionId": task.session_id,
        "agent": task.agent,
        "errorMessage": task.error_message,
        "notes": task.notes,
        "ordering": task.ordering,
        "createdAt": task.created_at,
        "startedAt": task.started_at,
        "completedAt": task.completed_at,
    }


@router.delete("/subtasks/{task_id}")
async def legacy_delete_subtask(
    task_id: str, _actor: AuthzDep, session: SessionDep
) -> dict[str, bool]:
    task = await session.get(SubTask, task_id)
    if task:
        await session.delete(task)
    return {"ok": True}


# ===== jenkins write ops =====


@router.post("/jenkins-templates")
async def legacy_create_jenkins_template(
    body: dict, _actor: AuthzDep, session: SessionDep
) -> dict:
    id = new_id("jt")
    now = utcnow()
    t = JenkinsTemplate(
        id=id,
        name=body["name"],
        job=body["job"],
        params=body.get("params", {}),
        jenkins_url=body.get("jenkinsUrl", "http://localhost:8080"),
        created_at=now,
    )
    session.add(t)
    return {
        "id": t.id,
        "name": t.name,
        "job": t.job,
        "params": t.params,
        "jenkinsUrl": t.jenkins_url,
        "createdAt": t.created_at,
    }


@router.patch("/jenkins-templates/{tid}")
async def legacy_patch_jenkins_template(
    tid: str, body: dict, _actor: AuthzDep, session: SessionDep
) -> dict:
    t = await session.get(JenkinsTemplate, tid)
    if not t:
        from devflow.core.errors import NotFound
        raise NotFound("template not found")
    if "name" in body:
        t.name = body["name"]
    if "job" in body:
        t.job = body["job"]
    if "params" in body:
        t.params = body["params"]
    if "jenkinsUrl" in body:
        t.jenkins_url = body["jenkinsUrl"]
    return {
        "id": t.id,
        "name": t.name,
        "job": t.job,
        "params": t.params,
        "jenkinsUrl": t.jenkins_url,
        "createdAt": t.created_at,
    }


@router.delete("/jenkins-templates/{tid}")
async def legacy_delete_jenkins_template(
    tid: str, _actor: AuthzDep, session: SessionDep
) -> dict[str, bool]:
    t = await session.get(JenkinsTemplate, tid)
    if t:
        await session.delete(t)
    return {"ok": True}


@router.post("/jenkins-templates/{tid}/trigger")
async def legacy_trigger_jenkins(
    tid: str, body: dict, _actor: AuthzDep, session: SessionDep
) -> dict:
    t = await session.get(JenkinsTemplate, tid)
    if not t:
        from devflow.core.errors import NotFound
        raise NotFound("template not found")
    vars_ = body.get("vars", {})
    substituted = {}
    for key, value in (t.params or {}).items():
        v = str(value)
        v = v.replace("{branch}", vars_.get("branch", ""))
        v = v.replace("{service}", vars_.get("service", ""))
        v = v.replace("{version}", vars_.get("version", ""))
        v = v.replace("{env}", vars_.get("env", ""))
        substituted[key] = v
    build_url = f"{t.jenkins_url}/job/{t.job}/lastBuild"
    # Fire-and-forget trigger via httpx
    import httpx
    try:
        await httpx.AsyncClient().post(
            f"{t.jenkins_url}/job/{t.job}/build",
            data=substituted,
            timeout=10,
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}
    return {"status": "triggered", "buildUrl": build_url}


# ===== release write ops =====


@router.post("/release/{run_id}/cancel")
async def legacy_cancel_release(
    run_id: str, _actor: AuthzDep, session: SessionDep
) -> dict[str, bool]:
    run = await session.get(ReleaseRun, run_id)
    if run:
        run.state = "cancelled"
    return {"ok": True}


@router.post("/release/{run_id}/resume")
async def legacy_resume_release(
    run_id: str, _actor: AuthzDep, session: SessionDep
) -> dict[str, bool]:
    run = await session.get(ReleaseRun, run_id)
    if run:
        run.state = "preparing"
    return {"ok": True}


@router.post("/release/{run_id}/verify")
async def legacy_verify_release(
    run_id: str, body: dict, _actor: AuthzDep, session: SessionDep
) -> dict[str, bool]:
    run = await session.get(ReleaseRun, run_id)
    if not run:
        from devflow.core.errors import NotFound
        raise NotFound("run not found")
    verdict = body.get("verdict")
    if verdict == "accepted":
        run.verdict = "accepted"
        run.state = "done"
    elif verdict == "rejected":
        run.verdict = None
        run.state = "error"
    return {"ok": True}


# ===== defects write ops =====


@router.post("/defects")
async def legacy_create_defect(
    body: dict, _actor: AuthzDep, session: SessionDep
) -> dict:
    id = new_id("df")
    now = utcnow()
    d = Defect(
        id=id,
        req_id=body["reqId"],
        sub_task_id=body.get("subTaskId"),
        test_run_id=body.get("testRunId"),
        title=body["title"],
        description=body.get("description", ""),
        severity=body.get("severity", "P2"),
        status="pending_confirm",
        created_at=now,
        updated_at=now,
    )
    session.add(d)
    return {
        "id": d.id,
        "reqId": d.req_id,
        "subTaskId": d.sub_task_id,
        "testRunId": d.test_run_id,
        "title": d.title,
        "description": d.description,
        "severity": d.severity,
        "status": d.status,
        "resolution": d.resolution,
        "wontFixReason": d.wont_fix_reason,
        "createdAt": d.created_at,
        "updatedAt": d.updated_at,
    }


@router.patch("/defects/{did}")
async def legacy_patch_defect(
    did: str, body: dict, _actor: AuthzDep, session: SessionDep
) -> dict:
    d = await session.get(Defect, did)
    if not d:
        from devflow.core.errors import NotFound
        raise NotFound("defect not found")
    old_status = d.status

    _DEFECT_ALLOWED = {
        "pending_confirm": ["to_fix", "wont_fix"],
        "to_fix": ["to_regress"],
        "to_regress": ["closed", "to_fix"],
        "closed": ["to_fix"],
        "wont_fix": ["to_fix"],
    }
    if "status" in body and body["status"] != old_status:
        if body["status"] not in _DEFECT_ALLOWED.get(old_status, []):
            from devflow.core.errors import Conflict
            raise Conflict(f"cannot transition from {old_status} to {body['status']}")
        if body["status"] == "wont_fix" and not body.get("wontFixReason") and not d.wont_fix_reason:
            from devflow.core.errors import BadRequest
            raise BadRequest("wont_fix requires wontFixReason")

    if "title" in body:
        d.title = body["title"]
    if "description" in body:
        d.description = body["description"]
    if "severity" in body:
        d.severity = body["severity"]
    if "status" in body:
        d.status = body["status"]
    if "resolution" in body:
        d.resolution = body["resolution"]
    if "wontFixReason" in body:
        d.wont_fix_reason = body["wontFixReason"]
    d.updated_at = utcnow()

    if "status" in body and body["status"] != old_status:
        hist = DefectStatusHistory(
            id=new_id("dsh"),
            defect_id=d.id,
            actor="user",
            from_status=old_status,
            to_status=body["status"],
            note=body.get("resolution"),
            created_at=utcnow(),
        )
        session.add(hist)

    return {
        "id": d.id,
        "reqId": d.req_id,
        "subTaskId": d.sub_task_id,
        "testRunId": d.test_run_id,
        "title": d.title,
        "description": d.description,
        "severity": d.severity,
        "status": d.status,
        "resolution": d.resolution,
        "wontFixReason": d.wont_fix_reason,
        "createdAt": d.created_at,
        "updatedAt": d.updated_at,
    }


@router.get("/defects/{did}/history")
async def legacy_defect_history(
    did: str, _actor: AuthzDep, session: SessionDep
) -> list[dict]:
    stmt = (
        select(DefectStatusHistory)
        .where(DefectStatusHistory.defect_id == did)
        .order_by(DefectStatusHistory.created_at.asc())
    )
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "id": r.id,
            "defectId": r.defect_id,
            "actor": r.actor,
            "fromStatus": r.from_status,
            "toStatus": r.to_status,
            "note": r.note,
            "createdAt": r.created_at,
        }
        for r in rows
    ]


@router.post("/defects/{did}/assign-agent")
async def legacy_defect_assign_agent(
    did: str, _actor: AuthzDep, session: SessionDep
) -> dict:
    d = await session.get(Defect, did)
    if not d:
        from devflow.core.errors import NotFound
        raise NotFound("defect not found")
    # Placeholder: agent fix orchestration is backend-specific and not ported yet
    return {"success": False, "status": d.status, "reason": "agent fix not yet implemented in py backend", "log": ""}


# ===== projects =====


@router.get("/projects")
async def legacy_list_projects(_actor: AuthzDep, session: SessionDep) -> list[dict]:
    stmt = select(Project).order_by(Project.sort_order.asc(), Project.name.asc())
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "name": r.name,
            "path": r.path,
            "lang": r.lang,
            "branch": r.branch,
            "branchPrefix": r.branch_prefix,
            "mergeStrategy": r.merge_strategy,
            "autoPush": r.auto_push,
            "services": r.services,
            "jenkinsTemplateId": r.jenkins_template_id,
            "dataSourceId": r.data_source_id,
            "logDirTemplate": r.log_dir_template,
            "logGlobTemplate": r.log_glob_template,
            "rootDir": r.root_dir,
            "sortOrder": r.sort_order,
        }
        for r in rows
    ]


@router.post("/projects/scan")
async def legacy_scan_projects(
    body: dict, _actor: AuthzDep, session: SessionDep
) -> dict:
    import subprocess
    from pathlib import Path

    roots = body.get("root", [])
    if isinstance(roots, str):
        roots = [roots]
    upserted: list[dict] = []
    for root in roots:
        root_path = Path(root).expanduser().resolve()
        for git_dir in root_path.rglob(".git"):
            repo_path = git_dir.parent
            try:
                name = repo_path.name
                branch_res = subprocess.run(
                    ["git", "-C", str(repo_path), "branch", "--show-current"],
                    capture_output=True, text=True, timeout=10
                )
                branch = branch_res.stdout.strip() or "master"
                lang = None
                for marker, detected in [
                    ("Cargo.toml", "rust"),
                    ("package.json", "js"),
                    ("go.mod", "go"),
                    ("requirements.txt", "py"),
                    ("pom.xml", "java"),
                    ("build.gradle", "java"),
                    ("pyproject.toml", "py"),
                ]:
                    if (repo_path / marker).exists():
                        lang = detected
                        break
                # upsert
                stmt = select(Project).where(Project.name == name)
                existing = (await session.execute(stmt)).scalar_one_or_none()
                if not existing:
                    max_stmt = select(func.max(Project.sort_order))
                    max_order = (await session.execute(max_stmt)).scalar() or -1
                    p = Project(
                        id=new_id("prj"),
                        name=name,
                        path=str(repo_path),
                        lang=lang,
                        branch=branch,
                        sort_order=max_order + 1,
                    )
                    session.add(p)
                else:
                    existing.path = str(repo_path)
                    existing.lang = lang
                    existing.branch = branch
                    p = existing
                upserted.append(
                    {
                        "name": p.name,
                        "path": p.path,
                        "lang": p.lang,
                        "branch": p.branch,
                        "branchPrefix": p.branch_prefix,
                        "mergeStrategy": p.merge_strategy,
                        "autoPush": p.auto_push,
                        "services": p.services,
                        "jenkinsTemplateId": p.jenkins_template_id,
                        "dataSourceId": p.data_source_id,
                        "logDirTemplate": p.log_dir_template,
                        "logGlobTemplate": p.log_glob_template,
                        "rootDir": p.root_dir,
                        "sortOrder": p.sort_order,
                    }
                )
            except Exception:
                continue
    return {"scanned": len(upserted), "projects": upserted}


@router.patch("/projects/{name}")
async def legacy_patch_project(
    name: str, body: dict, _actor: AuthzDep, session: SessionDep
) -> dict:
    stmt = select(Project).where(Project.name == name)
    p = (await session.execute(stmt)).scalar_one_or_none()
    if not p:
        from devflow.core.errors import NotFound
        raise NotFound("project not found")
    if "lang" in body:
        p.lang = body["lang"]
    if "branch" in body:
        p.branch = body["branch"]
    if "branchPrefix" in body:
        p.branch_prefix = body["branchPrefix"]
    if "mergeStrategy" in body:
        p.merge_strategy = body["mergeStrategy"]
    if "autoPush" in body:
        p.auto_push = body["autoPush"]
    if "services" in body:
        p.services = body["services"]
    if "jenkinsTemplateId" in body:
        p.jenkins_template_id = body["jenkinsTemplateId"]
    if "dataSourceId" in body:
        p.data_source_id = body["dataSourceId"]
    if "logDirTemplate" in body:
        p.log_dir_template = body["logDirTemplate"]
    if "logGlobTemplate" in body:
        p.log_glob_template = body["logGlobTemplate"]
    return {
        "name": p.name,
        "path": p.path,
        "lang": p.lang,
        "branch": p.branch,
        "branchPrefix": p.branch_prefix,
        "mergeStrategy": p.merge_strategy,
        "autoPush": p.auto_push,
        "services": p.services,
        "jenkinsTemplateId": p.jenkins_template_id,
        "dataSourceId": p.data_source_id,
        "logDirTemplate": p.log_dir_template,
        "logGlobTemplate": p.log_glob_template,
        "rootDir": p.root_dir,
        "sortOrder": p.sort_order,
    }


@router.delete("/projects/{name}")
async def legacy_delete_project(
    name: str, _actor: AuthzDep, session: SessionDep
) -> dict[str, bool]:
    stmt = select(Project).where(Project.name == name)
    p = (await session.execute(stmt)).scalar_one_or_none()
    if p:
        await session.delete(p)
    return {"ok": True}


@router.get("/projects/{name}/branches")
async def legacy_project_branches(
    name: str, _actor: AuthzDep, session: SessionDep
) -> list[str]:
    import subprocess

    stmt = select(Project).where(Project.name == name)
    p = (await session.execute(stmt)).scalar_one_or_none()
    if not p:
        from devflow.core.errors import NotFound
        raise NotFound("project not found")
    try:
        subprocess.run(
            ["git", "-C", p.path, "fetch", "--prune"],
            capture_output=True, timeout=30,
        )
        res = subprocess.run(
            ["git", "-C", p.path, "branch", "-a"],
            capture_output=True, text=True, timeout=10,
        )
        branches = []
        for line in res.stdout.splitlines():
            b = line.strip().lstrip("* ")
            b = b.replace("remotes/origin/", "")
            if b.startswith("HEAD"):
                continue
            if b and b not in branches:
                branches.append(b)
        branches.sort()
        return branches
    except Exception:
        return []


# ===== analysis =====


@router.get("/analysis/by-req/{req_id}")
async def legacy_analysis_by_req(
    req_id: str, _actor: AuthzDep, session: SessionDep
) -> list[dict]:
    stmt = (
        select(Analysis)
        .where(Analysis.req_id == req_id)
        .order_by(Analysis.created_at.desc())
    )
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "id": r.id,
            "reqId": r.req_id,
            "agent": r.agent,
            "status": r.status,
            "prompt": r.prompt,
            "output": _try_json(r.output) if r.output else None,
            "errorMessage": r.error_message,
            "sessionId": r.session_id,
            "createdAt": r.created_at,
            "updatedAt": r.updated_at,
        }
        for r in rows
    ]


def _try_json(s: str | None) -> object:
    import json
    try:
        return json.loads(s) if s else None
    except Exception:
        return None


@router.post("/analysis/start")
async def legacy_start_analysis(
    body: dict, _actor: AuthzDep, session: SessionDep
) -> dict:
    req_id = body["reqId"]
    agents = body.get("agents", [])
    prompt = body.get("prompt", "")
    now = utcnow()
    analyses = []
    for agent in agents:
        id = new_id("anl")
        a = Analysis(
            id=id,
            req_id=req_id,
            agent=agent,
            status="running",
            prompt=prompt,
            created_at=now,
            updated_at=now,
        )
        session.add(a)
        analyses.append(
            {
                "id": a.id,
                "reqId": a.req_id,
                "agent": a.agent,
                "status": a.status,
                "prompt": a.prompt,
                "output": None,
                "errorMessage": None,
                "sessionId": None,
                "createdAt": a.created_at,
                "updatedAt": a.updated_at,
            }
        )
    return {"analyses": analyses}


@router.post("/analysis/{aid}/choose")
async def legacy_choose_analysis(
    aid: str, _actor: AuthzDep, session: SessionDep
) -> dict:
    a = await session.get(Analysis, aid)
    if not a:
        from devflow.core.errors import NotFound
        raise NotFound("analysis not found")
    if a.status not in ("awaiting", "done"):
        from devflow.core.errors import BadRequest
        raise BadRequest(f"analysis status is '{a.status}', must be awaiting or done")
    output = _try_json(a.output) if a.output else None
    if not output or not isinstance(output, dict):
        from devflow.core.errors import BadRequest
        raise BadRequest("analysis has no output")
    proposed = output.get("proposedTasks", [])
    now = utcnow()
    title_to_id: dict[str, str] = {}
    subtasks = []
    for task in proposed:
        tid = new_id("stk")
        title_to_id[task.get("title", "")] = tid
        subtasks.append({"id": tid, "task": task})
    inserted = []
    for i, st in enumerate(subtasks):
        tid = st["id"]
        task = st["task"]
        depends_on = [
            title_to_id.get(dep)
            for dep in task.get("taskDependsOn", [])
        ]
        depends_on = [d for d in depends_on if d]
        t = SubTask(
            id=tid,
            req_id=a.req_id,
            analysis_id=aid,
            title=task.get("title", ""),
            prompt=task.get("prompt", ""),
            project=task.get("project"),
            type=task.get("type", "impl"),
            wave=task.get("wave", 0),
            task_depends_on=depends_on,
            acceptance=task.get("acceptance", []),
            verify_commands=task.get("verifyCommands", []),
            risk=task.get("risk"),
            status="pending",
            ordering=i,
            created_at=now,
        )
        session.add(t)
        inserted.append(
            {
                "id": t.id,
                "reqId": t.req_id,
                "title": t.title,
                "prompt": t.prompt,
                "project": t.project,
                "type": t.type,
                "wave": t.wave,
                "taskDependsOn": t.task_depends_on,
                "acceptance": t.acceptance,
                "verifyCommands": t.verify_commands,
                "risk": t.risk,
                "status": t.status,
                "ordering": t.ordering,
                "createdAt": t.created_at,
            }
        )
    # Update requirement stage
    from devflow.modules.requirement.models import Requirement
    req = await session.get(Requirement, a.req_id)
    if req:
        req.stage = "development"
        req.analysis_chosen_id = aid
    # Mark analysis done
    a.status = "done"
    a.updated_at = now
    return {"subTasks": inserted, "reqId": a.req_id}


@router.post("/analysis/{aid}/cancel")
async def legacy_cancel_analysis(
    aid: str, _actor: AuthzDep, session: SessionDep
) -> dict:
    a = await session.get(Analysis, aid)
    if not a:
        from devflow.core.errors import NotFound
        raise NotFound("analysis not found")
    a.status = "cancelled"
    a.updated_at = utcnow()
    return {
        "id": a.id,
        "reqId": a.req_id,
        "agent": a.agent,
        "status": a.status,
        "prompt": a.prompt,
        "output": _try_json(a.output) if a.output else None,
        "errorMessage": a.error_message,
        "sessionId": a.session_id,
        "createdAt": a.created_at,
        "updatedAt": a.updated_at,
    }


# ===== fs / settings / logs / test-plans-post placeholders =====


@router.get("/fs/ls")
async def legacy_fs_ls(_actor: AuthzDep, path: str | None = None) -> dict:
    from pathlib import Path
    target = Path(path or ".").expanduser()
    if not target.exists():
        return {"path": str(target), "parent": str(target.parent) if target.parent != target else None, "dirs": []}
    dirs = [d.name for d in target.iterdir() if d.is_dir() and not d.name.startswith(".")]
    dirs.sort()
    return {"path": str(target), "parent": str(target.parent) if target.parent != target else None, "dirs": dirs}


@router.get("/settings")
async def legacy_settings(_actor: AuthzDep, session: SessionDep) -> dict:
    # Minimal placeholder; real settings table may not exist yet
    return {"aiDefaultConfig": {"apiKey": None, "rawKeyExists": False, "baseUrl": None, "model": None}}


@router.put("/settings")
async def legacy_update_settings(body: dict, _actor: AuthzDep, session: SessionDep) -> dict:
    return body


@router.post("/test-connection")
async def legacy_test_connection(body: dict) -> dict:
    import time
    t0 = time.time()
    return {"ok": True, "latencyMs": int((time.time() - t0) * 1000)}


@router.get("/test-plans/by-req/{req_id}")
async def legacy_test_plans_by_req(
    req_id: str, _actor: AuthzDep, session: SessionDep
) -> list[dict]:
    from sqlalchemy import func as sql_func

    stmt = (
        select(TestPlan, sql_func.count(TestCase.id).label("case_count"))
        .outerjoin(TestCase, TestCase.plan_id == TestPlan.id)
        .where(TestPlan.req_id == req_id)
        .group_by(TestPlan.id)
        .order_by(TestPlan.created_at.desc())
    )
    rows = (await session.execute(stmt)).all()
    return [
        {
            "id": r[0].id,
            "reqId": r[0].req_id,
            "title": r[0].title,
            "description": r[0].description,
            "status": r[0].status,
            "createdAt": r[0].created_at,
            "caseCount": r[1],
        }
        for r in rows
    ]


@router.post("/test-plans")
async def legacy_create_test_plan(body: dict, _actor: AuthzDep, session: SessionDep) -> dict:
    id = new_id("tp")
    now = utcnow()
    p = TestPlan(
        id=id,
        req_id=body["reqId"],
        title=body["title"],
        description=body.get("description", ""),
        status="active",
        created_at=now,
    )
    session.add(p)
    return {"id": p.id, "reqId": p.req_id, "title": p.title, "description": p.description, "status": p.status, "createdAt": p.created_at}


def _log_target_out(r: LogTarget) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "project": r.project,
        "service": r.service,
        "environment": r.environment,
        "hosts": r.hosts or [],
        "connectMode": r.connect_mode,
        "sshUser": r.ssh_user,
        "sshPort": r.ssh_port,
        "sshKeyPath": r.ssh_key_path,
        "jumpHost": r.jump_host,
        "jumpUser": r.jump_user,
        "jumpPort": r.jump_port,
        "logDir": r.log_dir,
        "logGlob": r.log_glob,
        "createdAt": r.created_at,
    }


@router.get("/logs/targets")
async def legacy_log_targets(_actor: AuthzDep, session: SessionDep) -> list[dict]:
    rows = (await session.execute(select(LogTarget).order_by(LogTarget.created_at.desc()))).scalars().all()
    return [_log_target_out(r) for r in rows]


@router.post("/logs/targets")
async def legacy_create_log_target(
    body: dict, _actor: AuthzDep, session: SessionDep
) -> dict:
    id = new_id("lt")
    now = utcnow()
    t = LogTarget(
        id=id,
        name=body["name"],
        service=body["service"],
        project=body.get("project"),
        environment=body.get("environment", "production"),
        hosts=body.get("hosts", []),
        connect_mode=body.get("connectMode", "direct"),
        ssh_user=body.get("sshUser"),
        ssh_port=body.get("sshPort", 22),
        ssh_key_path=body.get("sshKeyPath"),
        jump_host=body.get("jumpHost"),
        jump_user=body.get("jumpUser"),
        jump_port=body.get("jumpPort", 22),
        log_dir=body.get("logDir"),
        log_glob=body.get("logGlob", "*.log"),
        created_at=now,
    )
    session.add(t)
    return _log_target_out(t)


@router.patch("/logs/targets/{tid}")
async def legacy_patch_log_target(
    tid: str, body: dict, _actor: AuthzDep, session: SessionDep
) -> dict:
    t = await session.get(LogTarget, tid)
    if not t:
        from devflow.core.errors import NotFound
        raise NotFound("log target not found")
    if "name" in body:
        t.name = body["name"]
    if "service" in body:
        t.service = body["service"]
    if "project" in body:
        t.project = body["project"]
    if "environment" in body:
        t.environment = body["environment"]
    if "hosts" in body:
        t.hosts = body["hosts"]
    if "connectMode" in body:
        t.connect_mode = body["connectMode"]
    if "sshUser" in body:
        t.ssh_user = body["sshUser"]
    if "sshPort" in body:
        t.ssh_port = body["sshPort"]
    if "sshKeyPath" in body:
        t.ssh_key_path = body["sshKeyPath"]
    if "jumpHost" in body:
        t.jump_host = body["jumpHost"]
    if "jumpUser" in body:
        t.jump_user = body["jumpUser"]
    if "jumpPort" in body:
        t.jump_port = body["jumpPort"]
    if "logDir" in body:
        t.log_dir = body["logDir"]
    if "logGlob" in body:
        t.log_glob = body["logGlob"]
    return _log_target_out(t)


@router.delete("/logs/targets/{tid}")
async def legacy_delete_log_target(
    tid: str, _actor: AuthzDep, session: SessionDep
) -> dict[str, bool]:
    t = await session.get(LogTarget, tid)
    if t:
        await session.delete(t)
    return {"ok": True}


# In-memory stub for log sessions (no DB table yet)
_log_session_store: dict[str, dict] = {}
_log_session_counter = 0


@router.get("/logs/sessions")
async def legacy_log_sessions(_actor: AuthzDep, session: SessionDep) -> list[dict]:
    return list(_log_session_store.values())


@router.post("/logs/sessions")
async def legacy_create_log_session(
    body: dict, _actor: AuthzDep, session: SessionDep
) -> dict:
    global _log_session_counter
    _log_session_counter += 1
    sid = f"ls-{_log_session_counter:06d}"
    now = utcnow().isoformat()
    rec = {
        "id": sid,
        "title": body.get("title", "New Session"),
        "scopedTargetIds": body.get("scopedTargetIds", []),
        "messages": [],
        "steps": [],
        "tab": "trace",
        "errorMessage": None,
        "createdAt": now,
        "updatedAt": now,
    }
    _log_session_store[sid] = rec
    return rec


@router.delete("/logs/sessions/{sid}")
async def legacy_delete_log_session(
    sid: str, _actor: AuthzDep, session: SessionDep
) -> dict[str, bool]:
    _log_session_store.pop(sid, None)
    return {"ok": True}


# ===== misc missing routes (frontend probes these) =====


@router.get("/attachments/{att_id}/raw")
async def legacy_attachment_raw(
    att_id: str, _actor: AuthzDep, session: SessionDep
):
    from fastapi import Response
    from devflow.core.storage import get_bytes

    att = await session.get(Attachment, att_id)
    if not att:
        from devflow.core.errors import NotFound
        raise NotFound("attachment not found")
    data = get_bytes(att.object_key)
    return Response(content=data, media_type=att.mime or "application/octet-stream")


@router.get("/pick-folder")
async def legacy_pick_folder() -> dict:
    # Web backend cannot open native folder picker; return empty to let frontend fall back
    return {"path": None, "hasGit": False}


@router.get("/system/env-checks")
async def legacy_env_checks() -> dict:
    return {
        "postgres": {"ok": True, "message": "connected"},
        "redis": {"ok": True, "message": "connected"},
        "minio": {"ok": True, "message": "connected"},
    }


@router.get("/documents/{doc_id}/export")
async def legacy_document_export(doc_id: str, format: str = "pdf") -> dict:
    return {"error": "export not yet implemented in py backend"}


@router.get("/documents/links")
async def legacy_document_links(reqId: str | None = None) -> list:
    return []


@router.post("/agent/run")
async def legacy_agent_run(body: dict) -> dict:
    return {"status": "queued", "runId": None, "reason": "agent run not yet implemented in py backend"}


@router.post("/gate-checks/run")
async def legacy_gate_check_run(body: dict) -> dict:
    return {"status": "skipped", "reason": "gate check run not yet implemented in py backend"}


@router.post("/release/start")
async def legacy_release_start(body: dict, _actor: AuthzDep, session: SessionDep) -> dict:
    id = new_id("rel")
    now = utcnow()
    run = ReleaseRun(
        id=id,
        req_id=body.get("reqId"),
        mode=body.get("mode", "auto"),
        state="preparing",
        started_at=now,
    )
    session.add(run)
    return {
        "id": run.id,
        "reqId": run.req_id,
        "mode": run.mode,
        "state": run.state,
        "verdict": run.verdict,
        "startedAt": run.started_at,
        "completedAt": run.completed_at,
    }


@router.post("/specs/requirement/generate")
async def legacy_specs_req_generate(body: dict) -> dict:
    return {"content": "", "error": "spec generation not yet implemented in py backend"}


@router.post("/specs/design/generate")
async def legacy_specs_design_generate(body: dict) -> dict:
    return {"content": "", "error": "spec generation not yet implemented in py backend"}


@router.post("/release/{run_id}/conflict-suggest")
async def legacy_conflict_suggest(run_id: str, _actor: AuthzDep, session: SessionDep) -> dict:
    return {"suggestions": []}


@router.post("/release/{run_id}/conflicts")
async def legacy_conflicts(run_id: str, _actor: AuthzDep, session: SessionDep) -> list:
    return []


@router.post("/agent/permission/{sid}/{mid}/approve")
async def legacy_permission_approve(
    sid: str, mid: str, _actor: AuthzDep, session: SessionDep
) -> dict[str, bool]:
    return {"ok": True}


@router.post("/agent/permission/{sid}/{mid}/reject")
async def legacy_permission_reject(
    sid: str, mid: str, _actor: AuthzDep, session: SessionDep
) -> dict[str, bool]:
    return {"ok": True}
