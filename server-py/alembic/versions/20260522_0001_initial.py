"""initial schema — pgvector extension + audit baseline

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-22

"""
from __future__ import annotations

from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gin")
    # Per-module schemas — keeps options open for physical split later.
    for schema in (
        "iam",
        "requirement",
        "delivery",
        "quality",
        "document",
        "agent",
        "notification",
    ):
        op.execute(f"CREATE SCHEMA IF NOT EXISTS {schema}")


def downgrade() -> None:
    for schema in (
        "notification",
        "agent",
        "document",
        "quality",
        "delivery",
        "requirement",
        "iam",
    ):
        op.execute(f"DROP SCHEMA IF EXISTS {schema} CASCADE")
    op.execute("DROP EXTENSION IF EXISTS btree_gin")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
    op.execute("DROP EXTENSION IF EXISTS vector")
