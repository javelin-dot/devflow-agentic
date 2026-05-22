"""Custom APIRouter that forces by-alias serialization so responses come out as camelCase
(matching the frontend's existing TypeScript types)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from fastapi.routing import APIRoute


class AliasAPIRoute(APIRoute):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        kwargs.setdefault("response_model_by_alias", True)
        super().__init__(*args, **kwargs)


def make_router(*args: Any, **kwargs: Any) -> APIRouter:
    kwargs.setdefault("route_class", AliasAPIRoute)
    return APIRouter(*args, **kwargs)
