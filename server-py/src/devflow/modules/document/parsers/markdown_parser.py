from __future__ import annotations

import re

from devflow.modules.document.parsers.base import ParsedBlock, ParsedDocument

_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
_CODE_FENCE = re.compile(r"^```")


class MarkdownParser:
    name = "markdown"
    suffixes = (".md", ".markdown")

    def parse(self, blob: bytes, *, filename: str | None = None) -> ParsedDocument:
        text = blob.decode("utf-8", errors="replace")
        blocks: list[ParsedBlock] = []
        title: str | None = None
        buf: list[str] = []
        in_code = False

        def flush(kind: str = "paragraph", level: int = 0) -> None:
            if buf:
                joined = "\n".join(buf).strip()
                if joined:
                    blocks.append(ParsedBlock(text=joined, kind=kind, level=level))
                buf.clear()

        for line in text.splitlines():
            if _CODE_FENCE.match(line):
                if in_code:
                    flush(kind="code")
                else:
                    flush()
                in_code = not in_code
                continue
            if in_code:
                buf.append(line)
                continue
            m = _HEADING.match(line)
            if m:
                flush()
                level = len(m.group(1))
                heading = m.group(2).strip()
                if title is None and level == 1:
                    title = heading
                blocks.append(ParsedBlock(text=heading, kind="heading", level=level))
                continue
            if line.strip() == "":
                flush()
            else:
                buf.append(line)
        flush()
        return ParsedDocument(title=title or filename, blocks=blocks)
