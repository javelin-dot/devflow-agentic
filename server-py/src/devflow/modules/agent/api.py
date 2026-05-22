from __future__ import annotations

from fastapi import status
from fastapi.responses import StreamingResponse

from devflow.core.deps import AuthzDep, SessionDep
from devflow.core.router import make_router
from devflow.modules.agent.schemas import (
    ChatIn,
    CreateSessionIn,
    MessageOut,
    SessionOut,
)
from devflow.modules.agent.service import AgentService

router = make_router(prefix="/agent", tags=["agent"])


@router.post("/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: CreateSessionIn, actor: AuthzDep, session: SessionDep
) -> SessionOut:
    s = await AgentService(session).create_session(body, actor)
    return SessionOut.model_validate(s)


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    _actor: AuthzDep, session: SessionDep, req_id: str | None = None
) -> list[SessionOut]:
    rows = await AgentService(session).list_sessions(req_id)
    return [SessionOut.model_validate(s) for s in rows]


@router.get("/sessions/{session_id}/messages", response_model=list[MessageOut])
async def history(
    session_id: str, _actor: AuthzDep, session: SessionDep
) -> list[MessageOut]:
    rows = await AgentService(session).history(session_id)
    return [MessageOut.model_validate(m) for m in rows]


@router.post("/sessions/{session_id}/chat", response_model=MessageOut)
async def chat(
    session_id: str, body: ChatIn, actor: AuthzDep, session: SessionDep
) -> MessageOut:
    m = await AgentService(session).chat_once(session_id, body, actor)
    return MessageOut.model_validate(m)


@router.post("/sessions/{session_id}/stream")
async def stream(
    session_id: str, body: ChatIn, actor: AuthzDep, session: SessionDep
) -> StreamingResponse:
    async def gen():  # type: ignore[no-untyped-def]
        async for token in AgentService(session).stream(session_id, body, actor):
            yield f"data: {token}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")
