"""arq worker entrypoint.

Run with:
    arq devflow.workers.main.WorkerSettings
"""

from __future__ import annotations

from arq.connections import RedisSettings

from devflow.config import get_settings
from devflow.workers.embedding_tasks import index_document_version
from devflow.workers.notification_tasks import deliver_notification


def _redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(get_settings().redis_url)


class WorkerSettings:
    functions = [index_document_version, deliver_notification]
    redis_settings = _redis_settings()
    max_jobs = 10
    job_timeout = 300
    keep_result = 3600

    @staticmethod
    async def on_startup(ctx: dict) -> None:  # type: ignore[type-arg]
        from devflow.core.events import DomainEvent, get_event_bus

        # Subscribe document.version.created -> schedule index_document_version
        async def on_version_created(ev: DomainEvent) -> None:
            redis = ctx["redis"]
            await redis.enqueue_job("index_document_version", ev.payload["version_id"])

        get_event_bus().subscribe("document.version.created", on_version_created)
