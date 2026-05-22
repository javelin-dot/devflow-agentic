from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    code = "internal_error"
    status_code = 500
    message = "Internal error"

    def __init__(self, message: str | None = None, *, detail: Any = None):
        super().__init__(message or self.message)
        self.message = message or self.message
        self.detail = detail


class NotFound(AppError):
    code = "not_found"
    status_code = 404
    message = "Resource not found"


class Conflict(AppError):
    code = "conflict"
    status_code = 409
    message = "Resource conflict"


class BadRequest(AppError):
    code = "bad_request"
    status_code = 400
    message = "Bad request"


class Unauthorized(AppError):
    code = "unauthorized"
    status_code = 401
    message = "Unauthorized"


class Forbidden(AppError):
    code = "forbidden"
    status_code = 403
    message = "Forbidden"


class StageGateViolation(AppError):
    code = "stage_gate_violation"
    status_code = 422
    message = "Stage gate check failed"


def _body(code: str, message: str, detail: Any = None) -> dict[str, Any]:
    body: dict[str, Any] = {"error": {"code": code, "message": message}}
    if detail is not None:
        body["error"]["detail"] = detail
    return body


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(_req: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_body(exc.code, exc.message, exc.detail),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_req: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=_body("validation_error", "Validation failed", exc.errors()),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_handler(_req: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_body("http_error", str(exc.detail)),
        )
