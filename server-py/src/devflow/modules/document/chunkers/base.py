from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from devflow.modules.document.parsers.base import ParsedDocument


@dataclass(slots=True)
class Chunk:
    seq: int
    text: str
    metadata: dict[str, object] = field(default_factory=dict)


class Chunker(Protocol):
    name: str

    def chunk(self, doc: ParsedDocument) -> list[Chunk]: ...


class ChunkerRegistry:
    def __init__(self) -> None:
        self._map: dict[str, Chunker] = {}
        self._default: Chunker | None = None

    def register(self, c: Chunker, *, default: bool = False) -> None:
        self._map[c.name] = c
        if default or self._default is None:
            self._default = c

    def get(self, name: str | None = None) -> Chunker:
        if name and name in self._map:
            return self._map[name]
        assert self._default is not None
        return self._default

    def all(self) -> list[Chunker]:
        return list(self._map.values())
