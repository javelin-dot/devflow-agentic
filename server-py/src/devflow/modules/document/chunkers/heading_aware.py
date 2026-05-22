from __future__ import annotations

from devflow.modules.document.chunkers.base import Chunk
from devflow.modules.document.parsers.base import ParsedBlock, ParsedDocument


class HeadingAwareChunker:
    """Groups blocks under their nearest heading. Falls back to size cap to avoid runaway chunks."""

    name = "heading_aware"

    def __init__(self, max_chars: int = 2000) -> None:
        self.max_chars = max_chars

    def chunk(self, doc: ParsedDocument) -> list[Chunk]:
        chunks: list[Chunk] = []
        seq = 0
        heading_stack: list[str] = []
        buf: list[ParsedBlock] = []

        def emit() -> None:
            nonlocal seq
            if not buf:
                return
            text = "\n\n".join(b.text for b in buf).strip()
            if text:
                chunks.append(
                    Chunk(
                        seq=seq,
                        text=text,
                        metadata={"headings": list(heading_stack)},
                    )
                )
                seq += 1
            buf.clear()

        running_size = 0
        for block in doc.blocks:
            if block.kind == "heading":
                emit()
                level = block.level or 1
                heading_stack = heading_stack[: level - 1] + [block.text]
                buf.append(block)
                running_size = len(block.text)
                continue
            buf.append(block)
            running_size += len(block.text) + 2
            if running_size >= self.max_chars:
                emit()
                running_size = 0
        emit()
        return chunks
