"""all tables — iam, requirement, delivery, quality, document, agent, notification

Revision ID: 0002_tables
Revises: 0001_initial
Create Date: 2026-05-22

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR

revision = "0002_tables"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

EMBED_DIM = 1536  # text-embedding-3-small / -large(1536) — adjust + new migration if model changes


def upgrade() -> None:
    # ===== iam =====
    op.create_table(
        "users",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, server_default="default"),
        sa.Column("username", sa.String(128), nullable=False),
        sa.Column("display_name", sa.String(255)),
        sa.Column("role", sa.String(32), nullable=False, server_default="viewer"),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "username", name="uq_users_tenant_username"),
        schema="iam",
    )
    op.create_index("ix_users_tenant", "users", ["tenant_id"], schema="iam")

    op.create_table(
        "roles",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, server_default="default"),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("description", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "name", name="uq_roles_tenant_name"),
        schema="iam",
    )

    op.create_table(
        "permissions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("role_id", sa.String(64), sa.ForeignKey("iam.roles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("resource", sa.String(255), nullable=False),
        sa.Column("action", sa.String(32), nullable=False),
        sa.UniqueConstraint("role_id", "resource", "action", name="uq_perm_role_res_act"),
        schema="iam",
    )

    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.String(64), sa.ForeignKey("iam.users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role_id", sa.String(64), sa.ForeignKey("iam.roles.id", ondelete="CASCADE"), primary_key=True),
        schema="iam",
    )

    op.create_table(
        "audit_log",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, server_default="default"),
        sa.Column("actor_id", sa.String(64)),
        sa.Column("actor_role", sa.String(32), nullable=False, server_default="system"),
        sa.Column("action", sa.String(128), nullable=False),
        sa.Column("target_type", sa.String(64)),
        sa.Column("target_id", sa.String(64)),
        sa.Column("before", JSONB),
        sa.Column("after", JSONB),
        sa.Column("request_id", sa.String(64)),
        sa.Column("ip", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="iam",
    )
    op.create_index("ix_audit_tenant_created", "audit_log", ["tenant_id", "created_at"], schema="iam")
    op.create_index("ix_audit_actor", "audit_log", ["actor_id"], schema="iam")
    op.create_index("ix_audit_target", "audit_log", ["target_type", "target_id"], schema="iam")

    # ===== requirement =====
    op.create_table(
        "req_sequence",
        sa.Column("id", sa.Integer, primary_key=True, server_default=sa.text("1")),
        sa.Column("next_val", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.CheckConstraint("id = 1", name="ck_req_sequence_singleton"),
        schema="requirement",
    )

    op.create_table(
        "requirements",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, server_default="default"),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("kind", sa.String(32), nullable=False, server_default="standard"),
        sa.Column("stage", sa.String(32), nullable=False, server_default="backlog"),
        sa.Column("priority", sa.String(16), nullable=False, server_default="medium"),
        sa.Column("workspace", sa.String(255)),
        sa.Column("tags", JSONB, server_default=sa.text("'[]'::jsonb")),
        sa.Column("planned_release_date", sa.DateTime(timezone=True)),
        sa.Column("released_at", sa.DateTime(timezone=True)),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
        sa.Column("analysis_chosen_id", sa.String(64)),
        sa.Column("profile_id", sa.String(64)),
        sa.Column("notes", sa.Text),
        sa.Column("api_doc", sa.Text),
        sa.Column("release_doc", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="requirement",
    )
    op.create_index("ix_req_tenant_stage", "requirements", ["tenant_id", "stage"], schema="requirement")
    op.create_index("ix_req_tenant_created", "requirements", ["tenant_id", "created_at"], schema="requirement")

    op.create_table(
        "projects",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, server_default="default"),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("path", sa.String(1024), nullable=False),
        sa.Column("lang", sa.String(64)),
        sa.Column("branch", sa.String(255), nullable=False, server_default="master"),
        sa.Column("branch_prefix", sa.String(64)),
        sa.Column("merge_strategy", sa.String(32), nullable=False, server_default="merge"),
        sa.Column("auto_push", sa.Boolean, server_default=sa.false()),
        sa.Column("services", JSONB, server_default=sa.text("'[]'::jsonb")),
        sa.Column("jenkins_template_id", sa.String(64)),
        sa.Column("data_source_id", sa.String(64)),
        sa.Column("log_dir_template", sa.String(1024)),
        sa.Column("log_glob_template", sa.String(255)),
        sa.Column("root_dir", sa.String(1024)),
        sa.Column("sort_order", sa.Integer, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "name", name="uq_projects_tenant_name"),
        schema="requirement",
    )

    op.create_table(
        "requirement_projects",
        sa.Column("req_id", sa.String(64), sa.ForeignKey("requirement.requirements.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("project", sa.String(128), primary_key=True),
        sa.Column("dev_branch", sa.String(255)),
        sa.Column("uat_branch", sa.String(255)),
        sa.Column("is_primary", sa.Boolean, server_default=sa.false()),
        schema="requirement",
    )

    op.create_table(
        "sub_tasks",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("req_id", sa.String(64), sa.ForeignKey("requirement.requirements.id", ondelete="CASCADE"), nullable=False),
        sa.Column("analysis_id", sa.String(64)),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("prompt", sa.Text, nullable=False, server_default=""),
        sa.Column("project", sa.String(128)),
        sa.Column("type", sa.String(32), nullable=False, server_default="impl"),
        sa.Column("wave", sa.Integer, server_default=sa.text("0")),
        sa.Column("task_depends_on", JSONB, server_default=sa.text("'[]'::jsonb")),
        sa.Column("acceptance", JSONB, server_default=sa.text("'[]'::jsonb")),
        sa.Column("verify_commands", JSONB, server_default=sa.text("'[]'::jsonb")),
        sa.Column("risk", sa.Text),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("session_id", sa.String(64)),
        sa.Column("agent", sa.String(64)),
        sa.Column("error_message", sa.Text),
        sa.Column("notes", sa.Text),
        sa.Column("ordering", sa.Integer, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        schema="requirement",
    )
    op.create_index("ix_subtask_req_status", "sub_tasks", ["req_id", "status"], schema="requirement")

    op.create_table(
        "analyses",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("req_id", sa.String(64), sa.ForeignKey("requirement.requirements.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="running"),
        sa.Column("prompt", sa.Text, nullable=False, server_default=""),
        sa.Column("output", sa.Text),
        sa.Column("error_message", sa.Text),
        sa.Column("session_id", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="requirement",
    )

    op.create_table(
        "contracts",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("req_id", sa.String(64), sa.ForeignKey("requirement.requirements.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, server_default=""),
        sa.Column("schema_type", sa.String(32), server_default="json"),
        sa.Column("schema_content", JSONB, server_default=sa.text("'{}'::jsonb")),
        sa.Column("status", sa.String(32), server_default="draft"),
        sa.Column("declared_by_task_id", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="requirement",
    )

    op.create_table(
        "events",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, server_default="default"),
        sa.Column("req_id", sa.String(64)),
        sa.Column("type", sa.String(64), nullable=False),
        sa.Column("payload", JSONB, server_default=sa.text("'{}'::jsonb")),
        sa.Column("actor", sa.String(64), server_default="system"),
        sa.Column("actor_role", sa.String(32), server_default="system"),
        sa.Column("target_type", sa.String(64)),
        sa.Column("target_id", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="requirement",
    )
    op.create_index("ix_events_tenant_req", "events", ["tenant_id", "req_id"], schema="requirement")
    op.create_index("ix_events_tenant_type", "events", ["tenant_id", "type"], schema="requirement")

    # ===== delivery =====
    op.create_table(
        "release_runs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, server_default="default"),
        sa.Column("req_id", sa.String(64)),
        sa.Column("mode", sa.String(32), nullable=False),
        sa.Column("state", sa.String(32), server_default="idle"),
        sa.Column("projects", JSONB, server_default=sa.text("'[]'::jsonb")),
        sa.Column("log", sa.Text, server_default=""),
        sa.Column("verdict", sa.String(32)),
        sa.Column("jenkins_build_url", sa.String(1024)),
        sa.Column("error", sa.Text),
        sa.Column("pr_url", sa.String(1024)),
        sa.Column("pr_status", sa.String(64)),
        sa.Column("release_branch", sa.String(255)),
        sa.Column("production_verify_result", JSONB),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        schema="delivery",
    )
    op.create_index("ix_release_tenant_state", "release_runs", ["tenant_id", "state"], schema="delivery")
    op.create_index("ix_release_req", "release_runs", ["req_id"], schema="delivery")

    op.create_table(
        "jenkins_templates",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, server_default="default"),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("job", sa.String(255), nullable=False),
        sa.Column("params", JSONB, server_default=sa.text("'{}'::jsonb")),
        sa.Column("jenkins_url", sa.String(1024), nullable=False, server_default="http://localhost:8080"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="delivery",
    )

    op.create_table(
        "log_targets",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, server_default="default"),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("project", sa.String(128)),
        sa.Column("service", sa.String(128), nullable=False),
        sa.Column("environment", sa.String(64), server_default="production"),
        sa.Column("hosts", JSONB, server_default=sa.text("'[]'::jsonb")),
        sa.Column("connect_mode", sa.String(32), server_default="direct"),
        sa.Column("ssh_user", sa.String(64)),
        sa.Column("ssh_port", sa.Integer, server_default=sa.text("22")),
        sa.Column("ssh_key_path", sa.String(1024)),
        sa.Column("jump_host", sa.String(255)),
        sa.Column("jump_user", sa.String(64)),
        sa.Column("jump_port", sa.Integer, server_default=sa.text("22")),
        sa.Column("log_dir", sa.String(1024)),
        sa.Column("log_glob", sa.String(255), server_default="*.log"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="delivery",
    )

    # ===== quality =====
    op.create_table(
        "test_plans",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, server_default="default"),
        sa.Column("req_id", sa.String(64), nullable=False),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("description", sa.Text, server_default=""),
        sa.Column("status", sa.String(32), server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="quality",
    )
    op.create_index("ix_plan_tenant_req", "test_plans", ["tenant_id", "req_id"], schema="quality")

    op.create_table(
        "test_cases",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("plan_id", sa.String(64), sa.ForeignKey("quality.test_plans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("req_id", sa.String(64), nullable=False),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("description", sa.Text, server_default=""),
        sa.Column("test_type", sa.String(32), server_default="functional"),
        sa.Column("legacy_type", sa.String(32)),
        sa.Column("command", sa.Text, server_default=""),
        sa.Column("expected_exit_code", sa.Integer, server_default=sa.text("0")),
        sa.Column("status", sa.String(32), server_default="draft"),
        sa.Column("cwd", sa.String(1024)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="quality",
    )

    op.create_table(
        "test_runs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, server_default="default"),
        sa.Column("plan_id", sa.String(64)),
        sa.Column("req_id", sa.String(64)),
        sa.Column("run_type", sa.String(32), server_default="manual"),
        sa.Column("status", sa.String(32), server_default="pending"),
        sa.Column("total", sa.Integer, server_default=sa.text("0")),
        sa.Column("passed", sa.Integer, server_default=sa.text("0")),
        sa.Column("failed", sa.Integer, server_default=sa.text("0")),
        sa.Column("skipped", sa.Integer, server_default=sa.text("0")),
        sa.Column("duration_ms", sa.Integer),
        sa.Column("log", sa.Text, server_default=""),
        sa.Column("coverage_json", JSONB),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        schema="quality",
    )
    op.create_index("ix_testrun_tenant_req", "test_runs", ["tenant_id", "req_id"], schema="quality")

    op.create_table(
        "gate_checks",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, server_default="default"),
        sa.Column("req_id", sa.String(64), nullable=False),
        sa.Column("from_stage", sa.String(32), nullable=False),
        sa.Column("to_stage", sa.String(32), nullable=False),
        sa.Column("check_type", sa.String(64), nullable=False),
        sa.Column("result", sa.String(32), server_default="pending"),
        sa.Column("detail", sa.Text, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="quality",
    )
    op.create_index("ix_gate_tenant_req", "gate_checks", ["tenant_id", "req_id"], schema="quality")

    op.create_table(
        "defects",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, server_default="default"),
        sa.Column("req_id", sa.String(64), nullable=False),
        sa.Column("sub_task_id", sa.String(64)),
        sa.Column("test_run_id", sa.String(64)),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("description", sa.Text, server_default=""),
        sa.Column("severity", sa.String(16), server_default="P2"),
        sa.Column("status", sa.String(32), server_default="pending_confirm"),
        sa.Column("resolution", sa.Text),
        sa.Column("wont_fix_reason", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="quality",
    )
    op.create_index("ix_defect_tenant_status", "defects", ["tenant_id", "status"], schema="quality")
    op.create_index("ix_defect_req", "defects", ["req_id"], schema="quality")

    op.create_table(
        "defect_status_history",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("defect_id", sa.String(64), sa.ForeignKey("quality.defects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor", sa.String(64), server_default="system"),
        sa.Column("from_status", sa.String(32)),
        sa.Column("to_status", sa.String(32), nullable=False),
        sa.Column("note", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="quality",
    )

    # ===== document =====
    op.create_table(
        "documents",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, server_default="default"),
        sa.Column("req_id", sa.String(64)),
        sa.Column("type", sa.String(64), nullable=False),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("current_version", sa.Integer, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        schema="document",
    )
    op.create_index("ix_doc_tenant_type", "documents", ["tenant_id", "type"], schema="document")
    op.create_index("ix_doc_tenant_req", "documents", ["tenant_id", "req_id"], schema="document")

    op.create_table(
        "document_versions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("doc_id", sa.String(64), sa.ForeignKey("document.documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("object_key", sa.String(1024), nullable=False),
        sa.Column("mime", sa.String(128)),
        sa.Column("size", sa.BigInteger, server_default=sa.text("0")),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("summary", sa.Text),
        sa.Column("author_id", sa.String(64)),
        sa.Column("author_agent", sa.String(64)),
        sa.Column("parser", sa.String(64)),
        sa.Column("chunker", sa.String(64)),
        sa.Column("embedded_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("doc_id", "version", name="uq_docver_doc_version"),
        schema="document",
    )
    op.create_index("ix_docver_content_hash", "document_versions", ["content_hash"], schema="document")

    op.create_table(
        "document_chunks",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, server_default="default"),
        sa.Column("doc_id", sa.String(64), nullable=False),
        sa.Column("doc_version_id", sa.String(64), sa.ForeignKey("document.document_versions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("seq", sa.Integer, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("tokens", sa.Integer, server_default=sa.text("0")),
        sa.Column("metadata", JSONB, server_default=sa.text("'{}'::jsonb")),
        sa.Column("embedding_model", sa.String(64), nullable=False),
        sa.Column("embedding", Vector(EMBED_DIM)),
        sa.Column("tsv", TSVECTOR),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="document",
    )
    op.create_index("ix_chunk_doc_ver", "document_chunks", ["doc_version_id"], schema="document")
    op.create_index("ix_chunk_tenant_model", "document_chunks", ["tenant_id", "embedding_model"], schema="document")

    op.create_table(
        "document_links",
        sa.Column("from_doc_id", sa.String(64), sa.ForeignKey("document.documents.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("to_doc_id", sa.String(64), sa.ForeignKey("document.documents.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("relation", sa.String(64), primary_key=True, server_default="derives_from"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="document",
    )

    op.create_table(
        "document_acl",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("doc_id", sa.String(64), sa.ForeignKey("document.documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("principal_type", sa.String(16), nullable=False),
        sa.Column("principal_id", sa.String(64), nullable=False),
        sa.Column("permission", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("doc_id", "principal_type", "principal_id", "permission", name="uq_acl_entry"),
        schema="document",
    )
    op.create_index("ix_acl_doc", "document_acl", ["doc_id"], schema="document")
    op.create_index("ix_acl_principal", "document_acl", ["principal_type", "principal_id"], schema="document")

    op.create_table(
        "attachments",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, server_default="default"),
        sa.Column("req_id", sa.String(64)),
        sa.Column("filename", sa.String(512), nullable=False),
        sa.Column("mime", sa.String(128)),
        sa.Column("size", sa.BigInteger, server_default=sa.text("0")),
        sa.Column("sha256", sa.String(64)),
        sa.Column("uploaded_by", sa.String(64)),
        sa.Column("object_key", sa.String(1024), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="document",
    )
    op.create_index("ix_att_req", "attachments", ["req_id"], schema="document")

    # ===== agent =====
    op.create_table(
        "sessions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, server_default="default"),
        sa.Column("req_id", sa.String(64)),
        sa.Column("title", sa.String(512), server_default=""),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("agent", sa.String(64), nullable=False),
        sa.Column("agent_locked", sa.Boolean, server_default=sa.false()),
        sa.Column("stage_snapshot", sa.String(32)),
        sa.Column("profile_id", sa.String(64)),
        sa.Column("cwd", sa.String(1024)),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
        sa.Column("archive_reason", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="agent",
    )
    op.create_index("ix_session_tenant_req", "sessions", ["tenant_id", "req_id"], schema="agent")
    op.create_index("ix_session_tenant_status", "sessions", ["tenant_id", "status"], schema="agent")

    op.create_table(
        "messages",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("session_id", sa.String(64), sa.ForeignKey("agent.sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("content", sa.Text, nullable=False, server_default=""),
        sa.Column("entry_type", sa.String(32)),
        sa.Column("action", sa.String(64)),
        sa.Column("status", sa.String(32)),
        sa.Column("tokens_in", sa.Integer, server_default=sa.text("0")),
        sa.Column("tokens_out", sa.Integer, server_default=sa.text("0")),
        sa.Column("rag_context", JSONB),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="agent",
    )
    op.create_index("ix_message_session_created", "messages", ["session_id", "created_at"], schema="agent")

    # ===== notification =====
    op.create_table(
        "notifications",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, server_default="default"),
        sa.Column("user_id", sa.String(64)),
        sa.Column("type", sa.String(64), nullable=False),
        sa.Column("payload", JSONB, server_default=sa.text("'{}'::jsonb")),
        sa.Column("channel", sa.String(32), server_default="inapp"),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.Column("delivery_status", sa.String(32), server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="notification",
    )
    op.create_index("ix_notif_user_unread", "notifications", ["user_id", "read_at"], schema="notification")

    op.create_table(
        "notification_subscriptions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False, server_default="default"),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("channel", sa.String(32), server_default="inapp"),
        sa.Column("target", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="notification",
    )


def downgrade() -> None:
    op.drop_table("notification_subscriptions", schema="notification")
    op.drop_table("notifications", schema="notification")
    op.drop_table("messages", schema="agent")
    op.drop_table("sessions", schema="agent")
    op.drop_table("attachments", schema="document")
    op.drop_table("document_acl", schema="document")
    op.drop_table("document_links", schema="document")
    op.drop_table("document_chunks", schema="document")
    op.drop_table("document_versions", schema="document")
    op.drop_table("documents", schema="document")
    op.drop_table("defect_status_history", schema="quality")
    op.drop_table("defects", schema="quality")
    op.drop_table("gate_checks", schema="quality")
    op.drop_table("test_runs", schema="quality")
    op.drop_table("test_cases", schema="quality")
    op.drop_table("test_plans", schema="quality")
    op.drop_table("log_targets", schema="delivery")
    op.drop_table("jenkins_templates", schema="delivery")
    op.drop_table("release_runs", schema="delivery")
    op.drop_table("events", schema="requirement")
    op.drop_table("contracts", schema="requirement")
    op.drop_table("analyses", schema="requirement")
    op.drop_table("sub_tasks", schema="requirement")
    op.drop_table("requirement_projects", schema="requirement")
    op.drop_table("projects", schema="requirement")
    op.drop_table("requirements", schema="requirement")
    op.drop_table("req_sequence", schema="requirement")
    op.drop_table("audit_log", schema="iam")
    op.drop_table("user_roles", schema="iam")
    op.drop_table("permissions", schema="iam")
    op.drop_table("roles", schema="iam")
    op.drop_table("users", schema="iam")
