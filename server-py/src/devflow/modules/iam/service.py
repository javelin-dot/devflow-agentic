from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from devflow.config import get_settings
from devflow.core.audit import write_audit
from devflow.core.errors import Conflict, NotFound, Unauthorized
from devflow.core.ids import new_id
from devflow.core.security import create_token, hash_password, verify_password
from devflow.modules.iam.models import User
from devflow.modules.iam.repository import UserRepository
from devflow.modules.iam.schemas import CreateUserIn, PatchUserIn


class IamService:
    def __init__(self, session: AsyncSession):
        self.s = session
        self.users = UserRepository(session)

    async def authenticate(self, username: str, password: str) -> tuple[str, User]:
        tenant = get_settings().default_tenant
        user = await self.users.get_by_username(tenant, username)
        if not user or not user.is_active:
            raise Unauthorized("invalid credentials")
        if not verify_password(password, user.password_hash):
            raise Unauthorized("invalid credentials")
        token = create_token(
            subject=user.id,
            extra={"username": user.username, "role": user.role, "tenant": user.tenant_id},
        )
        return token, user

    async def get_me(self, user_id: str) -> User:
        user = await self.users.get_by_id(user_id)
        if not user:
            raise Unauthorized("user not found")
        return user

    async def list_users(self) -> list[User]:
        return await self.users.list_all(get_settings().default_tenant)

    async def create_user(self, body: CreateUserIn, actor_id: str | None = None) -> User:
        tenant = get_settings().default_tenant
        existing = await self.users.get_by_username(tenant, body.username)
        if existing:
            raise Conflict("username already exists")
        user = User(
            id=new_id("usr"),
            tenant_id=tenant,
            username=body.username,
            display_name=body.display_name,
            role=body.role,
            password_hash=hash_password(body.password),
        )
        await self.users.add(user)
        await write_audit(
            self.s,
            tenant_id=tenant,
            actor_id=actor_id,
            action="user.create",
            target_type="user",
            target_id=user.id,
            after={"username": user.username, "role": user.role},
        )
        return user

    async def patch_user(self, user_id: str, body: PatchUserIn, actor_id: str | None = None) -> User:
        user = await self.users.get_by_id(user_id)
        if not user:
            raise NotFound("user not found")
        before = {"display_name": user.display_name, "role": user.role, "is_active": user.is_active}
        if body.display_name is not None:
            user.display_name = body.display_name
        if body.role is not None:
            user.role = body.role
        if body.password is not None:
            user.password_hash = hash_password(body.password)
        if body.is_active is not None:
            user.is_active = body.is_active
        await self.s.flush()
        await write_audit(
            self.s,
            tenant_id=user.tenant_id,
            actor_id=actor_id,
            action="user.update",
            target_type="user",
            target_id=user.id,
            before=before,
            after={"display_name": user.display_name, "role": user.role, "is_active": user.is_active},
        )
        return user

    async def delete_user(self, user_id: str, actor_id: str | None = None) -> None:
        user = await self.users.get_by_id(user_id)
        if not user:
            return
        await self.users.delete(user)
        await write_audit(
            self.s,
            tenant_id=user.tenant_id,
            actor_id=actor_id,
            action="user.delete",
            target_type="user",
            target_id=user_id,
        )

    async def ensure_seed_admin(self) -> None:
        """Mirror legacy behavior: seed local-admin/local-admin on first boot."""
        tenant = get_settings().default_tenant
        existing = await self.users.get_by_username(tenant, "local-admin")
        if existing:
            return
        await self.users.add(
            User(
                id=new_id("usr"),
                tenant_id=tenant,
                username="local-admin",
                display_name="Local Admin",
                role="admin",
                password_hash=hash_password("local-admin"),
            )
        )
