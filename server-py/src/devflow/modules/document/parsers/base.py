from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass(slots=True)
class ParsedBlock:
    text: str
    kind: str = "paragraph"  # paragraph | heading | list | code | table
    level: int = 0
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(slots=True)
class ParsedDocument:
    title: str | None
    blocks: list[ParsedBlock]
    metadata: dict[str, object] = field(default_factory=dict)


class Parser(Protocol):
    name: str
    suffixes: tuple[str, ...]

    def parse(self, blob: bytes, *, filename: str | None = None) -> ParsedDocument: ...


class ParserRegistry:
    def __init__(self) -> None:
        self._parsers: list[Parser] = []
        self._by_suffix: dict[str, Parser] = {}

    def register(self, parser: Parser) -> None:
        self._parsers.append(parser)
        for s in parser.suffixes:
            self._by_suffix[s.lower()] = parser

    def for_filename(self, filename: str) -> Parser:
        from pathlib import PurePosixPath

        suffix = PurePosixPath(filename).suffix.lower()
        parser = self._by_suffix.get(suffix)
        if not parser:
            return self._by_suffix[".txt"]
        return parser

    def all(self) -> list[Parser]:
        return list(self._parsers)
