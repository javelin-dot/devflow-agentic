from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from devflow.config import get_settings
from devflow.core.deps import CurrentUser
from devflow.core.errors import NotFound
from devflow.core.ids import new_id
from devflow.modules.agent.models import Message, Session
from devflow.modules.agent.providers import get_provider
from devflow.modules.agent.providers.base import ChatMessage, ChatRequest
from devflow.modules.agent.rag import build_context
from devflow.modules.agent.repository import MessageRepository, SessionRepository
from devflow.modules.agent.schemas import ChatIn, CreateSessionIn


class AgentService:
    def __init__(self, session: AsyncSession):
        self.s = session
        self.sessions = SessionRepository(session)
        self.messages = MessageRepository(session)
        self.tenant = get_settings().default_tenant

    async def create_session(self, body: CreateSessionIn, actor: CurrentUser) -> Session:
        sess = Session(
            id=new_id("sess"),
            tenant_id=self.tenant,
            req_id=body.req_id,
            title=body.title,
            agent=body.agent,
            cwd=body.cwd,
        )
        return await self.sessions.add(sess)

    async def list_sessions(self, req_id: str | None) -> list[Session]:
        return await self.sessions.list(self.tenant, req_id)

    async def history(self, session_id: str) -> list[Message]:
        return await self.messages.list(session_id)

    async def chat_once(self, session_id: str, body: ChatIn, actor: CurrentUser) -> Message:
        sess = await self.sessions.get(session_id)
        if not sess:
            raise NotFound(f"session {session_id} not found")

        # 1. Persist user message
        user_msg = Message(
            id=new_id("msg"),
            session_id=session_id,
            role="user",
            content=body.content,
            status="ok",
        )
        await self.messages.add(user_msg)

        # 2. Build RAG context
        system, refs = ("", [])
        if body.use_rag:
            system, refs = await build_context(self.s, actor, body.content)

        # 3. Assemble history
        history = await self.messages.list(session_id)
        req = ChatRequest(
            system=system or None,
            messages=[ChatMessage(role=m.role, content=m.content) for m in history if m.role in ("user", "assistant")],
            model=body.model,
        )

        # 4. Call provider
        provider = get_provider(sess.agent)
        reply_text = await provider.chat(req)

        # 5. Persist assistant message
        assistant_msg = Message(
            id=new_id("msg"),
            session_id=session_id,
            role="assistant",
            content=reply_text,
            status="ok",
            rag_context={"refs": refs} if refs else None,
        )
        await self.messages.add(assistant_msg)
        return assistant_msg

    async def stream(self, session_id: str, body: ChatIn, actor: CurrentUser) -> AsyncIterator[str]:
        sess = await self.sessions.get(session_id)
        if not sess:
            raise NotFound(f"session {session_id} not found")

        user_msg = Message(
            id=new_id("msg"),
            session_id=session_id,
            role="user",
            content=body.content,
            status="ok",
        )
        await self.messages.add(user_msg)

        system, refs = ("", [])
        if body.use_rag:
            system, refs = await build_context(self.s, actor, body.content)

        history = await self.messages.list(session_id)
        req = ChatRequest(
            system=system or None,
            messages=[
                ChatMessage(role=m.role, content=m.content)
                for m in history
                if m.role in ("user", "assistant")
            ],
            model=body.model,
        )
        provider = get_provider(sess.agent)

        buffer: list[str] = []
        async for token in provider.stream(req):
            buffer.append(token)
            yield token

        await self.messages.add(
            Message(
                id=new_id("msg"),
                session_id=session_id,
                role="assistant",
                content="".join(buffer),
                status="ok",
                rag_context={"refs": refs} if refs else None,
            )
        )
