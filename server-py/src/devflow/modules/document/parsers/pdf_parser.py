from __future__ import annotations

import io

from devflow.modules.document.parsers.base import ParsedBlock, ParsedDocument


class PdfParser:
    name = "pdf"
    suffixes = (".pdf",)

    def parse(self, blob: bytes, *, filename: str | None = None) -> ParsedDocument:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(blob))
        blocks: list[ParsedBlock] = []
        for idx, page in enumerate(reader.pages, start=1):
            text = (page.extract_text() or "").strip()
            if text:
                blocks.append(
                    ParsedBlock(text=text, kind="paragraph", metadata={"page": idx})
                )
        title = (reader.metadata.title if reader.metadata else None) or filename
        return ParsedDocument(title=title, blocks=blocks, metadata={"pages": len(reader.pages)})
