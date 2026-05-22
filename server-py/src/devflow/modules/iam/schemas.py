from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Role = Literal["admin", "dev", "qa", "pm", "viewer"]


class UserOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    id: str
    username: str
    display_name: str | None = Field(default=None, alias="displayName")
    role: str
    is_active: bool = Field(alias="isActive")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class LoginIn(BaseModel):
    username: str
    password: str


class LoginOut(BaseModel):
    token: str
    user: UserOut


class CreateUserIn(BaseModel):
    username: str
    password: str
    display_name: str | None = Field(default=None, alias="displayName")
    role: Role = "viewer"

    model_config = ConfigDict(populate_by_name=True)


class PatchUserIn(BaseModel):
    display_name: str | None = Field(default=None, alias="displayName")
    role: Role | None = None
    password: str | None = None
    is_active: bool | None = Field(default=None, alias="isActive")

    model_config = ConfigDict(populate_by_name=True)
