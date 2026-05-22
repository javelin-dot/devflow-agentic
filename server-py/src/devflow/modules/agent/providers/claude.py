from __future__ import annotations

from collections.abc import AsyncIterator

from devflow.config import get_settings
from devflow.modules.agent.providers.base import ChatRequest


class ClaudeProvider:
    name = "claude"
    default_model = "claude-sonnet-4-6"

    def _client(self):  # type: ignore[no-untyped-def]
        from anthropic import AsyncAnthropic

        return AsyncAnthropic(api_key=get_settings().anthropic_api_key)

    async def chat(self, req: ChatRequest) -> str:
        client = self._client()
        resp = await client.messages.create(
            model=req.model or self.default_model,
            system=req.system or "",
            messages=[{"role": m.role, "content": m.content} for m in req.messages],
            max_tokens=req.max_tokens,
            temperature=req.temperature,
        )
        # SDK returns content as list of blocks; join text blocks.
        return "".join(getattr(b, "text", "") for b in resp.content)

    async def stream(self, req: ChatRequest) -> AsyncIterator[str]:
        client = self._client()
        async with client.messages.stream(
            model=req.model or self.default_model,
            system=req.system or "",
            messages=[{"role": m.role, "content": m.content} for m in req.messages],
            max_tokens=req.max_tokens,
            temperature=req.temperature,
        ) as stream:
            async for text in stream.text_stream:
                yield text
