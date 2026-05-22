from __future__ import annotations

from devflow.modules.agent.providers.base import AgentProvider, ChatRequest, ChatStream
from devflow.modules.agent.providers.claude import ClaudeProvider
from devflow.modules.agent.providers.openai import OpenAIProvider

_providers: dict[str, AgentProvider] = {
    "claude": ClaudeProvider(),
    "openai": OpenAIProvider(),
}


def get_provider(name: str) -> AgentProvider:
    if name not in _providers:
        raise KeyError(f"unknown agent provider: {name}")
    return _providers[name]


__all__ = [
    "AgentProvider",
    "ChatRequest",
    "ChatStream",
    "ClaudeProvider",
    "OpenAIProvider",
    "get_provider",
]
