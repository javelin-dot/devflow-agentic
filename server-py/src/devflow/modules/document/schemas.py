from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DocumentOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    id: str
    req_id: str | None = Field(default=None, alias="reqId")
    type: str
    title: str
    status: str
    content: str = ""
    current_version: int = Field(alias="currentVersion")
    deleted_at: datetime | None = Field(default=None, alias="deletedAt")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class CreateDocumentIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    type: str
    title: str
    req_id: str | None = Field(default=None, alias="reqId")


class DocumentVersionOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    id: str
    doc_id: str = Field(alias="docId")
    version: int
    content: str = ""
    mime: str | None = None
    size: int
    summary: str | None = None
    parser: str | None = None
    chunker: str | None = None
    author_id: str | None = Field(default=None, alias="authorId")
    author_agent: str | None = Field(default=None, alias="authorAgent")
    embedded_at: datetime | None = Field(default=None, alias="embeddedAt")
    created_at: datetime = Field(alias="createdAt")


class SearchIn(BaseModel):
    query: str
    top_k: int = Field(default=8, ge=1, le=50, alias="topK")
    doc_types: list[str] | None = Field(default=None, alias="docTypes")
    mode: str = "hybrid"  # hybrid | vector | fulltext

    model_config = ConfigDict(populate_by_name=True)


class HitOut(BaseModel):
    chunk_id: int = Field(alias="chunkId")
    doc_id: str = Field(alias="docId")
    doc_version_id: str = Field(alias="docVersionId")
    seq: int
    content: str
    score: float
    source: str
    metadata: dict = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True)


class SearchOut(BaseModel):
    hits: list[HitOut]
    mode: str


class GrantAclIn(BaseModel):
    principal_type: str = Field(alias="principalType")
    principal_id: str = Field(alias="principalId")
    permission: str = "read"

    model_config = ConfigDict(populate_by_name=True)
