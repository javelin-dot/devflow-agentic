from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from devflow.config import get_settings
from devflow.core.db import dispose_engine
from devflow.core.errors import register_exception_handlers
from devflow.core.middleware import register_middleware
from devflow.core.redis import close_redis
from devflow.core.storage import ensure_bucket
from devflow.core.telemetry import configure_logging, init_telemetry


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[no-untyped-def]
    configure_logging()
    ensure_bucket()
    yield
    await dispose_engine()
    await close_redis()


def create_app() -> FastAPI:
    import time

    s = get_settings()
    app = FastAPI(
        title="DevFlow",
        version="0.1.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    app.state._boot_time = time.time()
    register_middleware(app)
    register_exception_handlers(app)
    init_telemetry(app)
    _register_routes(app)
    return app


def _register_routes(app: FastAPI) -> None:
    from devflow.compat import router as compat_router
    from devflow.modules.agent.api import router as agent_router
    from devflow.modules.delivery.api import router as delivery_router
    from devflow.modules.document.api import router as doc_router
    from devflow.modules.iam.api import router as iam_router
    from devflow.modules.notification.api import router as notif_router
    from devflow.modules.quality.api import router as quality_router
    from devflow.modules.requirement.api import router as req_router

    prefix = get_settings().api_prefix
    app.include_router(iam_router, prefix=prefix)
    app.include_router(req_router, prefix=prefix)
    app.include_router(doc_router, prefix=prefix)
    app.include_router(agent_router, prefix=prefix)
    app.include_router(delivery_router, prefix=prefix)
    app.include_router(quality_router, prefix=prefix)
    app.include_router(notif_router, prefix=prefix)
    app.include_router(compat_router, prefix=prefix)

    @app.get(f"{prefix}/health")
    async def health() -> dict[str, object]:
        import platform as sys_platform
        import time

        return {
            "status": "ok",
            "uptimeSeconds": int(time.time() - app.state.get("_boot_time", time.time())),
            "dbSizeKb": 0,
            "tableRowCounts": {},
            "agentCount": 0,
            "version": "0.1.0",
            "nodeVersion": f"Python {sys_platform.python_version()}",
            "platform": sys_platform.system(),
        }


app = create_app()
