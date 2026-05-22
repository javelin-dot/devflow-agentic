from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from devflow.core.db import Base, utcnow

SCHEMA = "delivery"


class ReleaseRun(Base):
    __tablename__ = "release_runs"
    __table_args__ = (
        Index("ix_release_tenant_state", "tenant_id", "state"),
        Index("ix_release_req", "req_id"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, default="default")
    req_id: Mapped[str | None] = mapped_column(String(64))
    mode: Mapped[str] = mapped_column(String(32), nullable=False)
    state: Mapped[str] = mapped_column(String(32), default="idle")
    projects: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    log: Mapped[str] = mapped_column(Text, default="")
    verdict: Mapped[str | None] = mapped_column(String(32))
    jenkins_build_url: Mapped[str | None] = mapped_column(String(1024))
    error: Mapped[str | None] = mapped_column(Text)
    pr_url: Mapped[str | None] = mapped_column(String(1024))
    pr_status: Mapped[str | None] = mapped_column(String(64))
    release_branch: Mapped[str | None] = mapped_column(String(255))
    production_verify_result: Mapped[Any | None] = mapped_column(JSONB)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class JenkinsTemplate(Base):
    __tablename__ = "jenkins_templates"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, default="default")
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    job: Mapped[str] = mapped_column(String(255), nullable=False)
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    jenkins_url: Mapped[str] = mapped_column(String(1024), nullable=False, default="http://localhost:8080")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class LogTarget(Base):
    __tablename__ = "log_targets"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, default="default")
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    project: Mapped[str | None] = mapped_column(String(128))
    service: Mapped[str] = mapped_column(String(128), nullable=False)
    environment: Mapped[str] = mapped_column(String(64), default="production")
    hosts: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    connect_mode: Mapped[str] = mapped_column(String(32), default="direct")
    ssh_user: Mapped[str | None] = mapped_column(String(64))
    ssh_port: Mapped[int] = mapped_column(default=22)
    ssh_key_path: Mapped[str | None] = mapped_column(String(1024))
    jump_host: Mapped[str | None] = mapped_column(String(255))
    jump_user: Mapped[str | None] = mapped_column(String(64))
    jump_port: Mapped[int] = mapped_column(default=22)
    log_dir: Mapped[str | None] = mapped_column(String(1024))
    log_glob: Mapped[str] = mapped_column(String(255), default="*.log")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
