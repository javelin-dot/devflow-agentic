from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from devflow.core.db import Base, utcnow

SCHEMA = "requirement"


class ReqSequence(Base):
    """Single-row table holding the next 6-digit requirement number."""

    __tablename__ = "req_sequence"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    next_val: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Requirement(Base):
    __tablename__ = "requirements"
    __table_args__ = (
        Index("ix_req_tenant_stage", "tenant_id", "stage"),
        Index("ix_req_tenant_created", "tenant_id", "created_at"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, default="default")
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="standard")
    stage: Mapped[str] = mapped_column(String(32), nullable=False, default="backlog")
    priority: Mapped[str] = mapped_column(String(16), nullable=False, default="medium")
    workspace: Mapped[str | None] = mapped_column(String(255))
    tags: Mapped[list[str] | None] = mapped_column(JSONB, default=list)
    planned_release_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    analysis_chosen_id: Mapped[str | None] = mapped_column(String(64))
    profile_id: Mapped[str | None] = mapped_column(String(64))
    notes: Mapped[str | None] = mapped_column(Text)
    api_doc: Mapped[str | None] = mapped_column(Text)
    release_doc: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    projects: Mapped[list["RequirementProject"]] = relationship(
        back_populates="requirement", cascade="all, delete-orphan"
    )
    sub_tasks: Mapped[list["SubTask"]] = relationship(
        back_populates="requirement", cascade="all, delete-orphan"
    )


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_projects_tenant_name"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, default="default")
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    path: Mapped[str] = mapped_column(String(1024), nullable=False)
    lang: Mapped[str | None] = mapped_column(String(64))
    branch: Mapped[str] = mapped_column(String(255), nullable=False, default="master")
    branch_prefix: Mapped[str | None] = mapped_column(String(64))
    merge_strategy: Mapped[str] = mapped_column(String(32), nullable=False, default="merge")
    auto_push: Mapped[bool] = mapped_column(Boolean, default=False)
    services: Mapped[list[Any]] = mapped_column(JSONB, default=list)
    jenkins_template_id: Mapped[str | None] = mapped_column(String(64))
    data_source_id: Mapped[str | None] = mapped_column(String(64))
    log_dir_template: Mapped[str | None] = mapped_column(String(1024))
    log_glob_template: Mapped[str | None] = mapped_column(String(255))
    root_dir: Mapped[str | None] = mapped_column(String(1024))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class RequirementProject(Base):
    __tablename__ = "requirement_projects"
    __table_args__ = {"schema": SCHEMA}

    req_id: Mapped[str] = mapped_column(
        String(64), ForeignKey(f"{SCHEMA}.requirements.id", ondelete="CASCADE"), primary_key=True
    )
    project: Mapped[str] = mapped_column(String(128), primary_key=True)
    dev_branch: Mapped[str | None] = mapped_column(String(255))
    uat_branch: Mapped[str | None] = mapped_column(String(255))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)

    requirement: Mapped[Requirement] = relationship(back_populates="projects")


class SubTask(Base):
    __tablename__ = "sub_tasks"
    __table_args__ = (
        Index("ix_subtask_req_status", "req_id", "status"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    req_id: Mapped[str] = mapped_column(
        String(64), ForeignKey(f"{SCHEMA}.requirements.id", ondelete="CASCADE"), nullable=False
    )
    analysis_id: Mapped[str | None] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False, default="")
    project: Mapped[str | None] = mapped_column(String(128))
    type: Mapped[str] = mapped_column(String(32), nullable=False, default="impl")
    wave: Mapped[int] = mapped_column(Integer, default=0)
    task_depends_on: Mapped[list[str]] = mapped_column(JSONB, default=list)
    acceptance: Mapped[list[str]] = mapped_column(JSONB, default=list)
    verify_commands: Mapped[list[str]] = mapped_column(JSONB, default=list)
    risk: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    session_id: Mapped[str | None] = mapped_column(String(64))
    agent: Mapped[str | None] = mapped_column(String(64))
    error_message: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    ordering: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    requirement: Mapped[Requirement] = relationship(back_populates="sub_tasks")


class Analysis(Base):
    __tablename__ = "analyses"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    req_id: Mapped[str] = mapped_column(
        String(64), ForeignKey(f"{SCHEMA}.requirements.id", ondelete="CASCADE"), nullable=False
    )
    agent: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="running")
    prompt: Mapped[str] = mapped_column(Text, nullable=False, default="")
    output: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    session_id: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class Contract(Base):
    __tablename__ = "contracts"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    req_id: Mapped[str] = mapped_column(
        String(64), ForeignKey(f"{SCHEMA}.requirements.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    schema_type: Mapped[str] = mapped_column(String(32), default="json")
    schema_content: Mapped[Any] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(32), default="draft")
    declared_by_task_id: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class Event(Base):
    """Event log — preserves legacy events table for audit / replay."""

    __tablename__ = "events"
    __table_args__ = (
        Index("ix_events_tenant_req", "tenant_id", "req_id"),
        Index("ix_events_tenant_type", "tenant_id", "type"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, default="default")
    req_id: Mapped[str | None] = mapped_column(String(64))
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[Any] = mapped_column(JSONB, default=dict)
    actor: Mapped[str] = mapped_column(String(64), default="system")
    actor_role: Mapped[str] = mapped_column(String(32), default="system")
    target_type: Mapped[str | None] = mapped_column(String(64))
    target_id: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
