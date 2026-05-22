"""SQLite -> PostgreSQL one-shot migration.

Translates all 28 legacy tables from server/data/devflow.db into the new module schemas.
Idempotent: skips rows that already exist (PG primary keys preserved from SQLite).

Document bodies migrate as a single DocumentVersion with the inline `content` blob
uploaded to MinIO. Re-indexing (chunk + embed) runs on demand via the worker.
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog
from rich.console import Console
from sqlalchemy import text as sql_text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from devflow.config import get_settings
from devflow.core.db import session_scope
from devflow.core.ids import new_id
from devflow.core.storage import ensure_bucket, put_bytes
from devflow.modules.agent.models import Message, Session
from devflow.modules.delivery.models import JenkinsTemplate, LogTarget, ReleaseRun
from devflow.modules.document.models import (
    Attachment,
    Document,
    DocumentLink,
    DocumentVersion,
)
from devflow.modules.document.storage import attachment_object_key, doc_object_key
from devflow.modules.iam.models import User
from devflow.modules.notification.models import (
    Notification,
    NotificationSubscription,
)
from devflow.modules.quality.models import (
    Defect,
    DefectStatusHistory,
    GateCheck,
    TestCase,
    TestPlan,
    TestRun,
)
from devflow.modules.requirement.models import (
    Analysis,
    Contract,
    Event,
    Project,
    ReqSequence,
    Requirement,
    RequirementProject,
    SubTask,
)

log = structlog.get_logger(__name__)
console = Console()


def _parse_dt(v: Any) -> datetime | None:
    if not v:
        return None
    if isinstance(v, datetime):
        return v
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None


def _parse_json(v: Any, default: Any) -> Any:
    if v is None or v == "":
        return default
    if isinstance(v, (dict, list)):
        return v
    try:
        return json.loads(v)
    except (TypeError, ValueError):
        return default


async def _bulk_insert(session: AsyncSession, model: type, rows: list[dict]) -> int:
    if not rows:
        return 0
    stmt = pg_insert(model).values(rows).on_conflict_do_nothing()
    await session.execute(stmt)
    return len(rows)


async def migrate_sqlite_async(
    sqlite_path: Path, attachments_dir: Path | None, *, dry_run: bool = False
) -> None:
    if not sqlite_path.exists():
        console.print(f"[red]source sqlite not found:[/red] {sqlite_path}")
        return

    tenant = get_settings().default_tenant
    conn = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row

    async with session_scope() as session:
        ensure_bucket()

        await _mig_users(conn, session, tenant)
        await _mig_projects(conn, session, tenant)
        await _mig_requirements(conn, session, tenant)
        await _mig_req_projects(conn, session)
        await _mig_req_seq(conn, session)
        await _mig_events(conn, session, tenant)
        await _mig_sub_tasks(conn, session)
        await _mig_analyses(conn, session)
        await _mig_contracts(conn, session)
        await _mig_sessions(conn, session, tenant)
        await _mig_messages(conn, session)
        await _mig_release_runs(conn, session, tenant)
        await _mig_jenkins_templates(conn, session, tenant)
        await _mig_log_targets(conn, session, tenant)
        await _mig_test_plans(conn, session, tenant)
        await _mig_test_cases(conn, session)
        await _mig_test_runs(conn, session, tenant)
        await _mig_gate_checks(conn, session, tenant)
        await _mig_defects(conn, session, tenant)
        await _mig_defect_history(conn, session)
        await _mig_documents(conn, session, tenant)
        await _mig_document_links(conn, session)
        await _mig_attachments(conn, session, tenant, attachments_dir)
        await _mig_notifications(conn, session, tenant)
        await _mig_notification_subs(conn, session, tenant)

        if dry_run:
            console.print("[yellow]dry-run: rolling back[/yellow]")
            await session.rollback()
            raise SystemExit(0)

    console.print("[green]migration complete[/green]")


async def _mig_users(conn: sqlite3.Connection, s: AsyncSession, tenant: str) -> None:
    rows = []
    for r in conn.execute("SELECT * FROM users"):
        rows.append(
            {
                "id": r["id"],
                "tenant_id": tenant,
                "username": r["username"],
                "display_name": r["display_name"],
                "role": r["role"],
                "password_hash": r["password_hash"],
                "is_active": True,
                "created_at": _parse_dt(r["created_at"]) or datetime.now(UTC),
                "updated_at": _parse_dt(r["updated_at"]) or datetime.now(UTC),
            }
        )
    n = await _bulk_insert(s, User, rows)
    console.print(f"users: {n}")


async def _mig_projects(conn: sqlite3.Connection, s: AsyncSession, tenant: str) -> None:
    rows = []
    for r in conn.execute("SELECT * FROM projects"):
        rows.append(
            {
                "id": new_id("prj"),
                "tenant_id": tenant,
                "name": r["name"],
                "path": r["path"],
                "lang": r["lang"],
                "branch": r["branch"] or "master",
                "branch_prefix": r["branch_prefix"],
                "merge_strategy": r["merge_strategy"] or "merge",
                "auto_push": bool(r["auto_push"] or 0),
                "services": _parse_json(r["services"], []),
                "jenkins_template_id": r["jenkins_template_id"],
                "data_source_id": r["data_source_id"],
                "log_dir_template": r["log_dir_template"],
                "log_glob_template": r["log_glob_template"],
                "root_dir": r["root_dir"],
                "sort_order": r["sort_order"] or 0,
                "created_at": datetime.now(UTC),
            }
        )
    n = await _bulk_insert(s, Project, rows)
    console.print(f"projects: {n}")


async def _mig_requirements(conn: sqlite3.Connection, s: AsyncSession, tenant: str) -> None:
    rows = []
    for r in conn.execute("SELECT * FROM requirements"):
        rows.append(
            {
                "id": r["id"],
                "tenant_id": tenant,
                "title": r["title"],
                "description": r["description"] or "",
                "kind": r["kind"] or "standard",
                "stage": r["stage"] or "backlog",
                "priority": r["priority"] or "medium",
                "workspace": r["workspace"],
                "tags": _parse_json(r["tags"], []),
                "planned_release_date": _parse_dt(r["planned_release_date"]),
                "released_at": _parse_dt(r["released_at"]),
                "archived_at": _parse_dt(r["archived_at"]),
                "analysis_chosen_id": r["analysis_chosen_id"],
                "profile_id": r["profile_id"],
                "notes": r["notes"],
                "api_doc": r["api_doc"],
                "release_doc": r["release_doc"],
                "created_at": _parse_dt(r["created_at"]) or datetime.now(UTC),
                "updated_at": _parse_dt(r["created_at"]) or datetime.now(UTC),
            }
        )
    n = await _bulk_insert(s, Requirement, rows)
    console.print(f"requirements: {n}")


async def _mig_req_projects(conn: sqlite3.Connection, s: AsyncSession) -> None:
    rows = []
    for r in conn.execute("SELECT * FROM requirement_projects"):
        rows.append(
            {
                "req_id": r["req_id"],
                "project": r["project"],
                "dev_branch": r["dev_branch"],
                "uat_branch": r["uat_branch"],
                "is_primary": bool(r["is_primary"] or 0),
            }
        )
    n = await _bulk_insert(s, RequirementProject, rows)
    console.print(f"requirement_projects: {n}")


async def _mig_req_seq(conn: sqlite3.Connection, s: AsyncSession) -> None:
    row = conn.execute("SELECT next_val FROM req_seq WHERE id=1").fetchone()
    if not row:
        return
    await s.execute(
        sql_text(
            "INSERT INTO requirement.req_sequence (id, next_val) VALUES (1, :v) "
            "ON CONFLICT (id) DO UPDATE SET next_val = GREATEST(requirement.req_sequence.next_val, :v)"
        ),
        {"v": int(row["next_val"])},
    )
    console.print(f"req_seq: next_val={row['next_val']}")


async def _mig_events(conn: sqlite3.Connection, s: AsyncSession, tenant: str) -> None:
    rows = []
    for r in conn.execute("SELECT * FROM events"):
        rows.append(
            {
                "id": r["id"],
                "tenant_id": tenant,
                "req_id": r["req_id"],
                "type": r["type"],
                "payload": _parse_json(r["payload"], {}),
                "actor": r["actor"] or "system",
                "actor_role": r["actor_role"] if "actor_role" in r.keys() else "system",
                "target_type": r["target_type"] if "target_type" in r.keys() else None,
                "target_id": r["target_id"] if "target_id" in r.keys() else None,
                "created_at": _parse_dt(r["created_at"]) or datetime.now(UTC),
            }
        )
    n = await _bulk_insert(s, Event, rows)
    console.print(f"events: {n}")


async def _mig_sub_tasks(conn: sqlite3.Connection, s: AsyncSession) -> None:
    rows = []
    for r in conn.execute("SELECT * FROM sub_tasks"):
        rows.append(
            {
                "id": r["id"],
                "req_id": r["req_id"],
                "analysis_id": r["analysis_id"],
                "title": r["title"],
                "prompt": r["prompt"] or "",
                "project": r["project"],
                "type": r["type"] or "impl",
                "wave": r["wave"] or 0,
                "task_depends_on": _parse_json(r["task_depends_on"], []),
                "acceptance": _parse_json(r["acceptance"], []),
                "verify_commands": _parse_json(r["verify_commands"], []),
                "risk": r["risk"],
                "status": r["status"] or "pending",
                "session_id": r["session_id"],
                "agent": r["agent"],
                "error_message": r["error_message"],
                "notes": r["notes"],
                "ordering": r["ordering"] or 0,
                "created_at": _parse_dt(r["created_at"]) or datetime.now(UTC),
                "started_at": _parse_dt(r["started_at"]),
                "completed_at": _parse_dt(r["completed_at"]),
            }
        )
    n = await _bulk_insert(s, SubTask, rows)
    console.print(f"sub_tasks: {n}")


async def _mig_analyses(conn: sqlite3.Connection, s: AsyncSession) -> None:
    rows = []
    for r in conn.execute("SELECT * FROM analyses"):
        rows.append(
            {
                "id": r["id"],
                "req_id": r["req_id"],
                "agent": r["agent"],
                "status": r["status"] or "running",
                "prompt": r["prompt"] or "",
                "output": r["output"],
                "error_message": r["error_message"],
                "session_id": r["session_id"],
                "created_at": _parse_dt(r["created_at"]) or datetime.now(UTC),
                "updated_at": _parse_dt(r["updated_at"]) or datetime.now(UTC),
            }
        )
    n = await _bulk_insert(s, Analysis, rows)
    console.print(f"analyses: {n}")


async def _mig_contracts(conn: sqlite3.Connection, s: AsyncSession) -> None:
    rows = []
    for r in conn.execute("SELECT * FROM contracts"):
        rows.append(
            {
                "id": r["id"],
                "req_id": r["req_id"],
                "name": r["name"],
                "description": r["description"] or "",
                "schema_type": r["schema_type"] or "json",
                "schema_content": _parse_json(r["schema_content"], {}),
                "status": r["status"] or "draft",
                "declared_by_task_id": r["declared_by_task_id"],
                "created_at": _parse_dt(r["created_at"]) or datetime.now(UTC),
                "updated_at": _parse_dt(r["updated_at"]) or datetime.now(UTC),
            }
        )
    n = await _bulk_insert(s, Contract, rows)
    console.print(f"contracts: {n}")


async def _mig_sessions(conn: sqlite3.Connection, s: AsyncSession, tenant: str) -> None:
    rows = []
    for r in conn.execute("SELECT * FROM sessions"):
        rows.append(
            {
                "id": r["id"],
                "tenant_id": tenant,
                "req_id": r["req_id"],
                "title": r["title"] or "",
                "status": r["status"] or "active",
                "agent": r["agent"],
                "agent_locked": bool(r["agent_locked"] or 0),
                "stage_snapshot": r["stage_snapshot"],
                "profile_id": r["profile_id"],
                "cwd": r["cwd"],
                "archived_at": _parse_dt(r["archived_at"]),
                "archive_reason": r["archive_reason"],
                "created_at": _parse_dt(r["created_at"]) or datetime.now(UTC),
            }
        )
    n = await _bulk_insert(s, Session, rows)
    console.print(f"sessions: {n}")


async def _mig_messages(conn: sqlite3.Connection, s: AsyncSession) -> None:
    rows = []
    for r in conn.execute("SELECT * FROM messages"):
        rows.append(
            {
                "id": r["id"],
                "session_id": r["session_id"],
                "role": r["role"],
                "content": r["content"] or "",
                "entry_type": r["entry_type"],
                "action": r["action"],
                "status": r["status"],
                "created_at": _parse_dt(r["created_at"]) or datetime.now(UTC),
            }
        )
    n = await _bulk_insert(s, Message, rows)
    console.print(f"messages: {n}")


async def _mig_release_runs(conn: sqlite3.Connection, s: AsyncSession, tenant: str) -> None:
    rows = []
    for r in conn.execute("SELECT * FROM release_runs"):
        rows.append(
            {
                "id": r["id"],
                "tenant_id": tenant,
                "req_id": r["req_id"],
                "mode": r["mode"],
                "state": r["state"] or "idle",
                "projects": _parse_json(r["projects"], []),
                "log": r["log"] or "",
                "verdict": r["verdict"],
                "jenkins_build_url": r["jenkins_build_url"],
                "error": r["error"],
                "pr_url": r["pr_url"] if "pr_url" in r.keys() else None,
                "pr_status": r["pr_status"] if "pr_status" in r.keys() else None,
                "release_branch": r["release_branch"] if "release_branch" in r.keys() else None,
                "production_verify_result": _parse_json(
                    r["production_verify_result"] if "production_verify_result" in r.keys() else None,
                    None,
                ),
                "started_at": _parse_dt(r["started_at"]) or datetime.now(UTC),
                "completed_at": _parse_dt(r["completed_at"]),
            }
        )
    n = await _bulk_insert(s, ReleaseRun, rows)
    console.print(f"release_runs: {n}")


async def _mig_jenkins_templates(conn: sqlite3.Connection, s: AsyncSession, tenant: str) -> None:
    rows = []
    for r in conn.execute("SELECT * FROM jenkins_templates"):
        rows.append(
            {
                "id": r["id"],
                "tenant_id": tenant,
                "name": r["name"],
                "job": r["job"],
                "params": _parse_json(r["params"], {}),
                "jenkins_url": r["jenkins_url"] or "http://localhost:8080",
                "created_at": _parse_dt(r["created_at"]) or datetime.now(UTC),
            }
        )
    n = await _bulk_insert(s, JenkinsTemplate, rows)
    console.print(f"jenkins_templates: {n}")


async def _mig_log_targets(conn: sqlite3.Connection, s: AsyncSession, tenant: str) -> None:
    rows = []
    for r in conn.execute("SELECT * FROM log_targets"):
        rows.append(
            {
                "id": r["id"],
                "tenant_id": tenant,
                "name": r["name"],
                "project": r["project"],
                "service": r["service"],
                "environment": r["environment"] or "production",
                "hosts": _parse_json(r["hosts"], []),
                "connect_mode": r["connect_mode"] or "direct",
                "ssh_user": r["ssh_user"],
                "ssh_port": r["ssh_port"] or 22,
                "ssh_key_path": r["ssh_key_path"],
                "jump_host": r["jump_host"],
                "jump_user": r["jump_user"],
                "jump_port": r["jump_port"] or 22,
                "log_dir": r["log_dir"],
                "log_glob": r["log_glob"] or "*.log",
                "created_at": _parse_dt(r["created_at"]) or datetime.now(UTC),
            }
        )
    n = await _bulk_insert(s, LogTarget, rows)
    console.print(f"log_targets: {n}")


async def _mig_test_plans(conn: sqlite3.Connection, s: AsyncSession, tenant: str) -> None:
    rows = []
    for r in conn.execute("SELECT * FROM test_plans"):
        rows.append(
            {
                "id": r["id"],
                "tenant_id": tenant,
                "req_id": r["req_id"],
                "title": r["title"],
                "description": r["description"] or "",
                "status": r["status"] or "active",
                "created_at": _parse_dt(r["created_at"]) or datetime.now(UTC),
            }
        )
    n = await _bulk_insert(s, TestPlan, rows)
    console.print(f"test_plans: {n}")


async def _mig_test_cases(conn: sqlite3.Connection, s: AsyncSession) -> None:
    rows = []
    for r in conn.execute("SELECT * FROM test_cases"):
        rows.append(
            {
                "id": r["id"],
                "plan_id": r["plan_id"],
                "req_id": r["req_id"],
                "title": r["title"],
                "description": r["description"] or "",
                "test_type": r["test_type"] or "functional",
                "legacy_type": r["legacy_type"] if "legacy_type" in r.keys() else None,
                "command": r["command"] or "",
                "expected_exit_code": r["expected_exit_code"] or 0,
                "status": r["status"] or "draft",
                "cwd": r["cwd"],
                "created_at": _parse_dt(r["created_at"]) or datetime.now(UTC),
            }
        )
    n = await _bulk_insert(s, TestCase, rows)
    console.print(f"test_cases: {n}")


async def _mig_test_runs(conn: sqlite3.Connection, s: AsyncSession, tenant: str) -> None:
    rows = []
    for r in conn.execute("SELECT * FROM test_runs"):
        rows.append(
            {
                "id": r["id"],
                "tenant_id": tenant,
                "plan_id": r["plan_id"],
                "req_id": r["req_id"],
                "run_type": r["run_type"] or "manual",
                "status": r["status"] or "pending",
                "total": r["total"] or 0,
                "passed": r["passed"] or 0,
                "failed": r["failed"] or 0,
                "skipped": r["skipped"] or 0,
                "duration_ms": r["duration_ms"],
                "log": r["log"] or "",
                "coverage_json": _parse_json(
                    r["coverage_json"] if "coverage_json" in r.keys() else None, None
                ),
                "started_at": _parse_dt(r["started_at"]) or datetime.now(UTC),
                "completed_at": _parse_dt(r["completed_at"]),
            }
        )
    n = await _bulk_insert(s, TestRun, rows)
    console.print(f"test_runs: {n}")


async def _mig_gate_checks(conn: sqlite3.Connection, s: AsyncSession, tenant: str) -> None:
    rows = []
    for r in conn.execute("SELECT * FROM gate_checks"):
        rows.append(
            {
                "id": r["id"],
                "tenant_id": tenant,
                "req_id": r["req_id"],
                "from_stage": r["from_stage"],
                "to_stage": r["to_stage"],
                "check_type": r["check_type"],
                "result": r["result"] or "pending",
                "detail": r["detail"] or "",
                "created_at": _parse_dt(r["created_at"]) or datetime.now(UTC),
            }
        )
    n = await _bulk_insert(s, GateCheck, rows)
    console.print(f"gate_checks: {n}")


async def _mig_defects(conn: sqlite3.Connection, s: AsyncSession, tenant: str) -> None:
    rows = []
    for r in conn.execute("SELECT * FROM defects"):
        rows.append(
            {
                "id": r["id"],
                "tenant_id": tenant,
                "req_id": r["req_id"],
                "sub_task_id": r["sub_task_id"],
                "test_run_id": r["test_run_id"],
                "title": r["title"],
                "description": r["description"] or "",
                "severity": r["severity"] or "P2",
                "status": r["status"] or "pending_confirm",
                "resolution": r["resolution"],
                "wont_fix_reason": r["wont_fix_reason"] if "wont_fix_reason" in r.keys() else None,
                "created_at": _parse_dt(r["created_at"]) or datetime.now(UTC),
                "updated_at": _parse_dt(r["updated_at"]) or datetime.now(UTC),
            }
        )
    n = await _bulk_insert(s, Defect, rows)
    console.print(f"defects: {n}")


async def _mig_defect_history(conn: sqlite3.Connection, s: AsyncSession) -> None:
    try:
        cur = conn.execute("SELECT * FROM defect_status_history")
    except sqlite3.OperationalError:
        return
    rows = []
    for r in cur:
        rows.append(
            {
                "id": r["id"],
                "defect_id": r["defect_id"],
                "actor": r["actor"] or "system",
                "from_status": r["from_status"],
                "to_status": r["to_status"],
                "note": r["note"],
                "created_at": _parse_dt(r["created_at"]) or datetime.now(UTC),
            }
        )
    n = await _bulk_insert(s, DefectStatusHistory, rows)
    console.print(f"defect_status_history: {n}")


async def _mig_documents(conn: sqlite3.Connection, s: AsyncSession, tenant: str) -> None:
    """Insert Documents + a single DocumentVersion (uploading legacy inline content to MinIO).
    Chunking/embedding happens on demand via the worker after migration."""
    import hashlib

    doc_rows: list[dict] = []
    ver_rows: list[dict] = []
    for r in conn.execute("SELECT * FROM documents"):
        doc_id = r["id"]
        body = (r["content"] or "").encode("utf-8")
        version = max(int(r["current_version"] or 0), 1)
        object_key = doc_object_key(tenant, doc_id, version)
        put_bytes(object_key, body, content_type="text/plain")

        doc_rows.append(
            {
                "id": doc_id,
                "tenant_id": tenant,
                "req_id": r["req_id"],
                "type": r["type"],
                "title": r["title"],
                "status": r["status"] or "draft",
                "current_version": version,
                "created_at": _parse_dt(r["created_at"]) or datetime.now(UTC),
                "updated_at": _parse_dt(r["updated_at"]) or datetime.now(UTC),
                "deleted_at": _parse_dt(r["deleted_at"]),
            }
        )
        ver_rows.append(
            {
                "id": new_id("dvr"),
                "doc_id": doc_id,
                "version": version,
                "object_key": object_key,
                "mime": "text/plain",
                "size": len(body),
                "content_hash": hashlib.sha256(body).hexdigest(),
                "summary": None,
                "author_id": None,
                "parser": "text",
                "chunker": "heading_aware",
                "created_at": _parse_dt(r["updated_at"]) or datetime.now(UTC),
            }
        )

    nd = await _bulk_insert(s, Document, doc_rows)
    nv = await _bulk_insert(s, DocumentVersion, ver_rows)
    console.print(f"documents: {nd} (versions: {nv})")

    # Historical versions
    hist = []
    for r in conn.execute("SELECT * FROM document_versions"):
        body = (r["content"] or "").encode("utf-8")
        object_key = doc_object_key(tenant, r["doc_id"], int(r["version"]))
        put_bytes(object_key, body, content_type="text/plain")
        hist.append(
            {
                "id": r["id"],
                "doc_id": r["doc_id"],
                "version": int(r["version"]),
                "object_key": object_key,
                "mime": "text/plain",
                "size": len(body),
                "content_hash": hashlib.sha256(body).hexdigest(),
                "summary": r["summary"],
                "author_id": r["author_id"],
                "author_agent": r["author_agent"],
                "parser": "text",
                "chunker": "heading_aware",
                "created_at": _parse_dt(r["created_at"]) or datetime.now(UTC),
            }
        )
    nh = await _bulk_insert(s, DocumentVersion, hist)
    console.print(f"document_versions (historical): {nh}")


async def _mig_document_links(conn: sqlite3.Connection, s: AsyncSession) -> None:
    rows = []
    for r in conn.execute("SELECT * FROM document_links"):
        rows.append(
            {
                "from_doc_id": r["from_doc_id"],
                "to_doc_id": r["to_doc_id"],
                "relation": r["relation"] or "derives_from",
                "created_at": _parse_dt(r["created_at"]) or datetime.now(UTC),
            }
        )
    n = await _bulk_insert(s, DocumentLink, rows)
    console.print(f"document_links: {n}")


async def _mig_attachments(
    conn: sqlite3.Connection, s: AsyncSession, tenant: str, attachments_dir: Path | None
) -> None:
    rows = []
    for r in conn.execute("SELECT * FROM attachments"):
        key = attachment_object_key(tenant, r["req_id"], r["id"], r["filename"])
        if attachments_dir is not None:
            legacy_path = attachments_dir / (r["storage_path"] or r["filename"])
            if legacy_path.exists():
                put_bytes(key, legacy_path.read_bytes(), content_type=r["mime"] or "application/octet-stream")
        rows.append(
            {
                "id": r["id"],
                "tenant_id": tenant,
                "req_id": r["req_id"],
                "filename": r["filename"],
                "mime": r["mime"],
                "size": r["size"] or 0,
                "sha256": r["sha256"],
                "uploaded_by": r["uploaded_by"],
                "object_key": key,
                "created_at": _parse_dt(r["created_at"]) or datetime.now(UTC),
            }
        )
    n = await _bulk_insert(s, Attachment, rows)
    console.print(f"attachments: {n}")


async def _mig_notifications(conn: sqlite3.Connection, s: AsyncSession, tenant: str) -> None:
    rows = []
    for r in conn.execute("SELECT * FROM notifications"):
        rows.append(
            {
                "id": r["id"],
                "tenant_id": tenant,
                "user_id": r["user_id"],
                "type": r["type"],
                "payload": _parse_json(r["payload"], {}),
                "channel": r["channel"] or "inapp",
                "read_at": _parse_dt(r["read_at"]),
                "delivery_status": r["delivery_status"] or "pending",
                "created_at": _parse_dt(r["created_at"]) or datetime.now(UTC),
            }
        )
    n = await _bulk_insert(s, Notification, rows)
    console.print(f"notifications: {n}")


async def _mig_notification_subs(
    conn: sqlite3.Connection, s: AsyncSession, tenant: str
) -> None:
    rows = []
    for r in conn.execute("SELECT * FROM notification_subscriptions"):
        rows.append(
            {
                "id": r["id"],
                "tenant_id": tenant,
                "user_id": r["user_id"],
                "event_type": r["event_type"],
                "channel": r["channel"] or "inapp",
                "target": r["target"],
                "created_at": _parse_dt(r["created_at"]) or datetime.now(UTC),
            }
        )
    n = await _bulk_insert(s, NotificationSubscription, rows)
    console.print(f"notification_subscriptions: {n}")


if __name__ == "__main__":
    import sys

    asyncio.run(migrate_sqlite_async(Path(sys.argv[1]), None))
