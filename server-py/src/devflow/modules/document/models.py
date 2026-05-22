from __future__ import annotations

from datetime import datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from devflow.config import get_settings
from devflow.core.db import Base, utcnow

SCHEMA = "document"

_EMBEDDING_DIM = get_settings().default_embedding_dim


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        Index("ix_doc_tenant_type", "tenant_id", "type"),
        Index("ix_doc_tenant_req", "tenant_id", "req_id"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, default="default")
    req_id: Mapped[str | None] = mapped_column(String(64))
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    current_version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    versions: Mapped[list["DocumentVersion"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class DocumentVersion(Base):
    """A specific snapshot of a Document. Body lives in MinIO at object_key; DB holds metadata only."""

    __tablename__ = "document_versions"
    __table_args__ = (
        UniqueConstraint("doc_id", "version", name="uq_docver_doc_version"),
        Index("ix_docver_content_hash", "content_hash"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    doc_id: Mapped[str] = mapped_column(
        String(64), ForeignKey(f"{SCHEMA}.documents.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    object_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    mime: Mapped[str | None] = mapped_column(String(128))
    size: Mapped[int] = mapped_column(BigInteger, default=0)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    author_id: Mapped[str | None] = mapped_column(String(64))
    author_agent: Mapped[str | None] = mapped_column(String(64))
    parser: Mapped[str | None] = mapped_column(String(64))
    chunker: Mapped[str | None] = mapped_column(String(64))
    embedded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    document: Mapped[Document] = relationship(back_populates="versions")


class DocumentChunk(Base):
    """A retrievable slice of a document version. Multiple embedding models can coexist per chunk
    via the (chunk_id, embedding_model) compound row pattern — but for simplicity v1 stores one
    embedding per chunk and tags the model so re-embedding can run in place."""

    __tablename__ = "document_chunks"
    __table_args__ = (
        Index("ix_chunk_doc_ver", "doc_version_id"),
        Index("ix_chunk_tenant_model", "tenant_id", "embedding_model"),
        # HNSW index created in a follow-up migration once embedding_model partition is decided
        {"schema": SCHEMA},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, default="default")
    doc_id: Mapped[str] = mapped_column(String(64), nullable=False)
    doc_version_id: Mapped[str] = mapped_column(
        String(64), ForeignKey(f"{SCHEMA}.document_versions.id", ondelete="CASCADE"), nullable=False
    )
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tokens: Mapped[int] = mapped_column(Integer, default=0)
    metadata_: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict)
    embedding_model: Mapped[str] = mapped_column(String(64), nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(_EMBEDDING_DIM))
    tsv: Mapped[Any | None] = mapped_column(TSVECTOR)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class DocumentLink(Base):
    __tablename__ = "document_links"
    __table_args__ = {"schema": SCHEMA}

    from_doc_id: Mapped[str] = mapped_column(
        String(64), ForeignKey(f"{SCHEMA}.documents.id", ondelete="CASCADE"), primary_key=True
    )
    to_doc_id: Mapped[str] = mapped_column(
        String(64), ForeignKey(f"{SCHEMA}.documents.id", ondelete="CASCADE"), primary_key=True
    )
    relation: Mapped[str] = mapped_column(String(64), primary_key=True, default="derives_from")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class DocumentAcl(Base):
    """Document-level access control. Lookups MUST hit Redis cache, not this table directly."""

    __tablename__ = "document_acl"
    __table_args__ = (
        Index("ix_acl_doc", "doc_id"),
        Index("ix_acl_principal", "principal_type", "principal_id"),
        UniqueConstraint(
            "doc_id", "principal_type", "principal_id", "permission", name="uq_acl_entry"
        ),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    doc_id: Mapped[str] = mapped_column(
        String(64), ForeignKey(f"{SCHEMA}.documents.id", ondelete="CASCADE"), nullable=False
    )
    principal_type: Mapped[str] = mapped_column(String(16), nullable=False)  # user|role|group
    principal_id: Mapped[str] = mapped_column(String(64), nullable=False)
    permission: Mapped[str] = mapped_column(String(16), nullable=False)  # read|write|admin
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Attachment(Base):
    __tablename__ = "attachments"
    __table_args__ = (
        Index("ix_att_req", "req_id"),
        {"schema": SCHEMA},
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, default="default")
    req_id: Mapped[str | None] = mapped_column(String(64))
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    mime: Mapped[str | None] = mapped_column(String(128))
    size: Mapped[int] = mapped_column(BigInteger, default=0)
    sha256: Mapped[str | None] = mapped_column(String(64))
    uploaded_by: Mapped[str | None] = mapped_column(String(64))
    object_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
