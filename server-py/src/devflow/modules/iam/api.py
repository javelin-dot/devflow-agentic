from __future__ import annotations

from fastapi import status

from devflow.core.deps import AuthzDep, SessionDep, UserDep
from devflow.core.router import make_router
from devflow.modules.iam.schemas import (
    CreateUserIn,
    LoginIn,
    LoginOut,
    PatchUserIn,
    UserOut,
)
from devflow.modules.iam.service import IamService

router = make_router(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginOut)
async def login(body: LoginIn, session: SessionDep) -> LoginOut:
    token, user = await IamService(session).authenticate(body.username, body.password)
    return LoginOut(token=token, user=UserOut.model_validate(user))


@router.post("/logout")
async def logout(_user: UserDep) -> dict[str, bool]:
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: UserDep, session: SessionDep) -> UserOut:
    u = await IamService(session).get_me(user.id)
    return UserOut.model_validate(u)


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(body: CreateUserIn, actor: AuthzDep, session: SessionDep) -> UserOut:
    u = await IamService(session).create_user(body, actor_id=actor.id)
    return UserOut.model_validate(u)


@router.get("/users", response_model=list[UserOut])
async def list_users(_actor: AuthzDep, session: SessionDep) -> list[UserOut]:
    rows = await IamService(session).list_users()
    return [UserOut.model_validate(r) for r in rows]


@router.patch("/users/{user_id}", response_model=UserOut)
async def patch_user(
    user_id: str, body: PatchUserIn, actor: AuthzDep, session: SessionDep
) -> UserOut:
    u = await IamService(session).patch_user(user_id, body, actor_id=actor.id)
    return UserOut.model_validate(u)


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, actor: AuthzDep, session: SessionDep) -> dict[str, bool]:
    await IamService(session).delete_user(user_id, actor_id=actor.id)
    return {"ok": True}
