from __future__ import annotations

from devflow.modules.document.chunkers.base import Chunk
from devflow.modules.document.parsers.base import ParsedDocument


class FixedSizeChunker:
    name = "fixed_size"

    def __init__(self, target_chars: int = 1200, overlap: int = 150) -> None:
        self.target_chars = target_chars
        self.overlap = overlap

    def chunk(self, doc: ParsedDocument) -> list[Chunk]:
        text = "\n\n".join(b.text for b in doc.blocks)
        chunks: list[Chunk] = []
        i = 0
        seq = 0
        n = len(text)
        while i < n:
            end = min(i + self.target_chars, n)
            piece = text[i:end].strip()
            if piece:
                chunks.append(Chunk(seq=seq, text=piece))
                seq += 1
            if end >= n:
                break
            i = max(end - self.overlap, i + 1)
        return chunks
