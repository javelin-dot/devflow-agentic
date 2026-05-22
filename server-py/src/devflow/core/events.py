"""In-process pub/sub. Cross-module communication goes through this — never import another module's repository directly."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

import structlog

log = structlog.get_logger(__name__)

EventHandler = Callable[["DomainEvent"], Awaitable[None]]


@dataclass(slots=True)
class DomainEvent:
    type: str
    payload: dict[str, Any] = field(default_factory=dict)
    actor: str | None = None
    tenant_id: str | None = None


class EventBus:
    def __init__(self) -> None:
        self._handlers: dict[str, list[EventHandler]] = {}

    def subscribe(self, event_type: str, handler: EventHandler) -> None:
        self._handlers.setdefault(event_type, []).append(handler)

    async def publish(self, event: DomainEvent) -> None:
        handlers = self._handlers.get(event.type, [])
        if not handlers:
            return
        results = await asyncio.gather(
            *(self._safe(h, event) for h in handlers), return_exceptions=True
        )
        for r in results:
            if isinstance(r, Exception):
                log.error("event_handler_failed", event_type=event.type, error=str(r))

    @staticmethod
    async def _safe(handler: EventHandler, event: DomainEvent) -> None:
        try:
            await handler(event)
        except Exception as e:
            log.exception("event_handler_error", event_type=event.type, error=str(e))
            raise


_bus = EventBus()


def get_event_bus() -> EventBus:
    return _bus
