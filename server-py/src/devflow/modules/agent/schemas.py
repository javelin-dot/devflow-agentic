from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CreateSessionIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    req_id: str | None = Field(default=None, alias="reqId")
    title: str = ""
    agent: str = "claude"
    cwd: str | None = None


class SessionOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    id: str
    req_id: str | None = Field(default=None, alias="reqId")
    title: str
    status: str
    agent: str
    agent_locked: bool = Field(default=False, alias="agentLocked")
    stage_snapshot: str | None = Field(default=None, alias="stageSnapshot")
    profile_id: str | None = Field(default=None, alias="profileId")
    cwd: str | None = Field(default=None, alias="cwd")
    archived_at: datetime | None = Field(default=None, alias="archivedAt")
    archive_reason: str | None = Field(default=None, alias="archiveReason")
    created_at: datetime = Field(alias="createdAt")


class MessageOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    id: str
    session_id: str = Field(alias="sessionId")
    role: str
    content: str
    entry_type: str | None = Field(default=None, alias="entryType")
    action: str | None = None
    status: str | None = None
    rag_context: dict | None = Field(default=None, alias="ragContext")
    created_at: datetime = Field(alias="createdAt")


class ChatIn(BaseModel):
    content: str
    use_rag: bool = Field(default=True, alias="useRag")
    model: str | None = None

    model_config = ConfigDict(populate_by_name=True)
