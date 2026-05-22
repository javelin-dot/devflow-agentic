from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from devflow.config import get_settings
from devflow.core.db import get_session
from devflow.core.errors import Forbidden, Unauthorized
from devflow.core.rbac import check
from devflow.core.security import decode_token


@dataclass(slots=True)
class CurrentUser:
    id: str
    username: str
    role: str
    tenant_id: str


async def current_user(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise Unauthorized("missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        claims = decode_token(token)
    except ValueError as e:
        raise Unauthorized(str(e)) from e

    user = CurrentUser(
        id=claims["sub"],
        username=claims.get("username", ""),
        role=claims.get("role", "viewer"),
        tenant_id=claims.get("tenant", get_settings().default_tenant),
    )
    request.state.current_user = user
    return user


async def authorize(
    request: Request,
    user: Annotated[CurrentUser, Depends(current_user)],
) -> CurrentUser:
    if not check(user.role, request.url.path, request.method):
        raise Forbidden(f"role '{user.role}' cannot {request.method} {request.url.path}")
    return user


SessionDep = Annotated[AsyncSession, Depends(get_session)]
UserDep = Annotated[CurrentUser, Depends(current_user)]
AuthzDep = Annotated[CurrentUser, Depends(authorize)]
