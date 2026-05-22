"""RAG context builder. Wraps document.search() and formats the result as a system prompt prefix."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from devflow.core.deps import CurrentUser
from devflow.modules.document.service import DocumentService


async def build_context(
    session: AsyncSession,
    actor: CurrentUser,
    query: str,
    *,
    top_k: int = 6,
    max_chars: int = 4000,
) -> tuple[str, list[dict]]:
    hits = await DocumentService(session).search(query, actor, mode="hybrid", top_k=top_k)
    parts: list[str] = []
    refs: list[dict] = []
    total = 0
    for i, h in enumerate(hits, start=1):
        snippet = h.content.strip()
        budget = max_chars - total
        if budget <= 0:
            break
        if len(snippet) > budget:
            snippet = snippet[:budget] + "..."
        parts.append(f"[{i}] doc:{h.doc_id} ver:{h.doc_version_id}\n{snippet}")
        refs.append(
            {
                "n": i,
                "doc_id": h.doc_id,
                "version_id": h.doc_version_id,
                "score": h.score,
                "source": h.source,
            }
        )
        total += len(snippet)
    if not parts:
        return "", refs
    block = "Use the following retrieved context to ground your answer. Cite as [n].\n\n" + "\n\n".join(parts)
    return block, refs
