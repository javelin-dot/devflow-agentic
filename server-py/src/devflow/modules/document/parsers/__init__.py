"""Document parser registry. Add new formats by writing a Parser and registering it here."""

from __future__ import annotations

from devflow.modules.document.parsers.base import (
    ParsedBlock,
    ParsedDocument,
    Parser,
    ParserRegistry,
)
from devflow.modules.document.parsers.docx_parser import DocxParser
from devflow.modules.document.parsers.markdown_parser import MarkdownParser
from devflow.modules.document.parsers.pdf_parser import PdfParser
from devflow.modules.document.parsers.text_parser import TextParser

_registry = ParserRegistry()
_registry.register(TextParser())
_registry.register(MarkdownParser())
_registry.register(PdfParser())
_registry.register(DocxParser())


def get_registry() -> ParserRegistry:
    return _registry


__all__ = ["ParsedBlock", "ParsedDocument", "Parser", "ParserRegistry", "get_registry"]
