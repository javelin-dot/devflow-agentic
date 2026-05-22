from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RequirementProjectOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    project: str
    dev_branch: str | None = Field(default=None, alias="devBranch")
    uat_branch: str | None = Field(default=None, alias="uatBranch")
    is_primary: bool = Field(default=False, alias="isPrimary")


class RequirementOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    id: str
    title: str
    description: str = ""
    kind: str = "standard"
    stage: str
    priority: str
    workspace: str | None = None
    tags: list[str] = Field(default_factory=list)
    projects: list[RequirementProjectOut] = Field(default_factory=list)
    planned_release_date: datetime | None = Field(default=None, alias="plannedReleaseDate")
    released_at: datetime | None = Field(default=None, alias="releasedAt")
    archived_at: datetime | None = Field(default=None, alias="archivedAt")
    analysis_chosen_id: str | None = Field(default=None, alias="analysisChosenId")
    profile_id: str | None = Field(default=None, alias="profileId")
    api_doc: str | None = Field(default=None, alias="apiDoc")
    release_doc: str | None = Field(default=None, alias="releaseDoc")
    notes: str | None = None
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class CreateRequirementIn(BaseModel):
    title: str
    description: str = ""
    kind: str = "standard"
    priority: str = "medium"
    workspace: str | None = None
    tags: list[str] = Field(default_factory=list)
    projects: list[str] = Field(default_factory=list)


class PatchRequirementIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str | None = None
    description: str | None = None
    priority: str | None = None
    stage: str | None = None
    workspace: str | None = None
    tags: list[str] | None = None
    notes: str | None = None
    planned_release_date: datetime | None = Field(default=None, alias="plannedReleaseDate")
    projects: list[RequirementProjectOut] | None = None


class TransitionStageIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    to_stage: str = Field(alias="toStage")
    reason: str | None = None


class SubTaskOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    id: str
    req_id: str = Field(alias="reqId")
    title: str
    prompt: str
    project: str | None = None
    type: str
    wave: int
    task_depends_on: list[str] = Field(default_factory=list, alias="taskDependsOn")
    acceptance: list[str] = Field(default_factory=list)
    verify_commands: list[str] = Field(default_factory=list, alias="verifyCommands")
    status: str
    ordering: int
    created_at: datetime = Field(alias="createdAt")
    started_at: datetime | None = Field(default=None, alias="startedAt")
    completed_at: datetime | None = Field(default=None, alias="completedAt")
