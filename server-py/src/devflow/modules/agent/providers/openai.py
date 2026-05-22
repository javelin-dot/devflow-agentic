from __future__ import annotations

from collections.abc import AsyncIterator

from devflow.config import get_settings
from devflow.modules.agent.providers.base import ChatRequest


class OpenAIProvider:
    name = "openai"
    default_model = "gpt-4o-mini"

    def _client(self):  # type: ignore[no-untyped-def]
        from openai import AsyncOpenAI

        return AsyncOpenAI(api_key=get_settings().openai_api_key)

    async def chat(self, req: ChatRequest) -> str:
        client = self._client()
        messages: list[dict] = []
        if req.system:
            messages.append({"role": "system", "content": req.system})
        messages.extend({"role": m.role, "content": m.content} for m in req.messages)
        resp = await client.chat.completions.create(
            model=req.model or self.default_model,
            messages=messages,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
        )
        return resp.choices[0].message.content or ""

    async def stream(self, req: ChatRequest) -> AsyncIterator[str]:
        client = self._client()
        messages: list[dict] = []
        if req.system:
            messages.append({"role": "system", "content": req.system})
        messages.extend({"role": m.role, "content": m.content} for m in req.messages)
        stream = await client.chat.completions.create(
            model=req.model or self.default_model,
            messages=messages,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                yield delta
