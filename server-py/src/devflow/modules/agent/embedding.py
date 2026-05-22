from __future__ import annotations

from tenacity import retry, stop_after_attempt, wait_exponential

from devflow.config import get_settings


class OpenAIEmbedder:
    """OpenAI text-embedding-3-small / -large. Implements the document.embedder.Embedder protocol."""

    def __init__(self, model: str | None = None, dim: int | None = None) -> None:
        s = get_settings()
        self.model = model or s.default_embedding_model
        self.dim = dim or s.default_embedding_dim

    def _client(self):  # type: ignore[no-untyped-def]
        from openai import AsyncOpenAI

        return AsyncOpenAI(api_key=get_settings().openai_api_key)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        client = self._client()
        resp = await client.embeddings.create(model=self.model, input=texts)
        return [d.embedding for d in resp.data]
