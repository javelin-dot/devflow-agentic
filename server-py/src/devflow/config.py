from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="DEVFLOW_",
        case_sensitive=False,
        extra="ignore",
    )

    env: str = "dev"
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 4000
    api_prefix: str = "/api"
    cors_origins: str = "http://localhost:5173"

    jwt_secret: str = "change-me"
    jwt_alg: str = "HS256"
    jwt_expire_min: int = 720
    rbac_enabled: bool = False

    pg_dsn: str = "postgresql+asyncpg://devflow:devflow@localhost:5432/devflow"
    pg_pool_size: int = 20
    pg_max_overflow: int = 10

    redis_url: str = "redis://localhost:6379/0"

    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "devflow"
    minio_secure: bool = False

    default_tenant: str = "default"
    default_embedding_model: str = "text-embedding-3-small"
    default_embedding_dim: int = 1536

    otel_enabled: bool = False
    otel_endpoint: str = "http://localhost:4317"

    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
