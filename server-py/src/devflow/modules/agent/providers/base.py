from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Protocol


@dataclass(slots=True)
class ChatMessage:
    role: str
    content: str


@dataclass(slots=True)
class ChatRequest:
    messages: list[ChatMessage]
    system: str | None = None
    model: str | None = None
    temperature: float = 0.2
    max_tokens: int = 2048
    metadata: dict[str, object] = field(default_factory=dict)


ChatStream = AsyncIterator[str]


class AgentProvider(Protocol):
    name: str
    default_model: str

    async def chat(self, req: ChatRequest) -> str: ...

    def stream(self, req: ChatRequest) -> ChatStream: ...
