from __future__ import annotations

import structlog

from devflow.core.db import session_scope
from devflow.modules.document.service import DocumentService

log = structlog.get_logger(__name__)


async def index_document_version(_ctx: dict, version_id: str) -> dict:  # type: ignore[type-arg]
    async with session_scope() as session:
        count = await DocumentService(session).index_version(version_id)
        log.info("document_indexed", version_id=version_id, chunks=count)
        return {"version_id": version_id, "chunks": count}
