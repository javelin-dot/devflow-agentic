from __future__ import annotations

from devflow.modules.document.parsers.base import ParsedBlock, ParsedDocument


class TextParser:
    name = "text"
    suffixes = (".txt", ".log", ".csv")

    def parse(self, blob: bytes, *, filename: str | None = None) -> ParsedDocument:
        text = blob.decode("utf-8", errors="replace")
        blocks = [ParsedBlock(text=p.strip()) for p in text.split("\n\n") if p.strip()]
        return ParsedDocument(title=filename, blocks=blocks)
