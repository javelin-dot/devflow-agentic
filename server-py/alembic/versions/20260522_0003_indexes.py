"""HNSW vector index + tsvector trigger + GIN/trgm indexes

Revision ID: 0003_indexes
Revises: 0002_tables
Create Date: 2026-05-22

Notes
-----
HNSW build cost grows with row count. For a fresh DB this is instant; for a backfilled
DB with millions of chunks this can take minutes. Run during maintenance window.

The tsvector column on document.document_chunks is auto-populated by a BEFORE
INSERT/UPDATE trigger — never write to `tsv` from application code.
"""
from __future__ import annotations

from alembic import op

revision = "0003_indexes"
down_revision = "0002_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---- HNSW vector index (cosine distance) on document_chunks.embedding ----
    # m=16, ef_construction=64 is the pgvector default; good balance for < 50M vectors.
    op.execute(
        """
        CREATE INDEX ix_chunks_embedding_hnsw
            ON document.document_chunks
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64)
        """
    )

    # ---- tsvector auto-update trigger for document_chunks.content -> tsv ----
    op.execute(
        """
        CREATE OR REPLACE FUNCTION document.chunks_tsv_update()
            RETURNS trigger AS $$
        BEGIN
            NEW.tsv := to_tsvector('simple', coalesce(NEW.content, ''));
            RETURN NEW;
        END
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER chunks_tsv_trigger
            BEFORE INSERT OR UPDATE OF content
            ON document.document_chunks
            FOR EACH ROW EXECUTE FUNCTION document.chunks_tsv_update()
        """
    )
    op.execute(
        """
        CREATE INDEX ix_chunks_tsv_gin
            ON document.document_chunks
            USING gin (tsv)
        """
    )

    # ---- Full-text helpers across other text-heavy tables (uses pg_trgm GIN) ----
    op.execute(
        """
        CREATE INDEX ix_req_title_trgm
            ON requirement.requirements
            USING gin (title gin_trgm_ops)
        """
    )
    op.execute(
        """
        CREATE INDEX ix_req_description_trgm
            ON requirement.requirements
            USING gin (description gin_trgm_ops)
        """
    )
    op.execute(
        """
        CREATE INDEX ix_doc_title_trgm
            ON document.documents
            USING gin (title gin_trgm_ops)
        """
    )
    op.execute(
        """
        CREATE INDEX ix_defect_title_trgm
            ON quality.defects
            USING gin (title gin_trgm_ops)
        """
    )

    # ---- JSONB containment indexes where we filter on payload/tags ----
    op.execute(
        """
        CREATE INDEX ix_req_tags_gin
            ON requirement.requirements
            USING gin (tags jsonb_path_ops)
        """
    )
    op.execute(
        """
        CREATE INDEX ix_event_payload_gin
            ON requirement.events
            USING gin (payload jsonb_path_ops)
        """
    )
    op.execute(
        """
        CREATE INDEX ix_notif_payload_gin
            ON notification.notifications
            USING gin (payload jsonb_path_ops)
        """
    )

    # ---- Partial index: unread notifications hot-path ----
    op.execute(
        """
        CREATE INDEX ix_notif_unread_user
            ON notification.notifications (user_id, created_at DESC)
            WHERE read_at IS NULL
        """
    )

    # ---- Backfill tsv for any pre-existing rows ----
    op.execute("UPDATE document.document_chunks SET tsv = to_tsvector('simple', content) WHERE tsv IS NULL")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS notification.ix_notif_unread_user")
    op.execute("DROP INDEX IF EXISTS notification.ix_notif_payload_gin")
    op.execute("DROP INDEX IF EXISTS requirement.ix_event_payload_gin")
    op.execute("DROP INDEX IF EXISTS requirement.ix_req_tags_gin")
    op.execute("DROP INDEX IF EXISTS quality.ix_defect_title_trgm")
    op.execute("DROP INDEX IF EXISTS document.ix_doc_title_trgm")
    op.execute("DROP INDEX IF EXISTS requirement.ix_req_description_trgm")
    op.execute("DROP INDEX IF EXISTS requirement.ix_req_title_trgm")
    op.execute("DROP INDEX IF EXISTS document.ix_chunks_tsv_gin")
    op.execute("DROP TRIGGER IF EXISTS chunks_tsv_trigger ON document.document_chunks")
    op.execute("DROP FUNCTION IF EXISTS document.chunks_tsv_update()")
    op.execute("DROP INDEX IF EXISTS document.ix_chunks_embedding_hnsw")
