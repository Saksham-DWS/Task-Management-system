from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from pydantic import AliasChoices, Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _db_name_from_uri(uri: str) -> str:
    """
    Extract the database name from a MongoDB URI path segment.
    Raises ValueError if no database name is present.
    """
    parsed = urlparse(uri)
    db_name = parsed.path.lstrip("/").split("/")[0].split("?")[0]
    if not db_name:
        raise ValueError("MongoDB URI must include a database name in the path")
    return db_name


class Settings(BaseSettings):
    _env_path = Path(__file__).resolve().parent.parent / ".env"
    model_config = SettingsConfigDict(env_file=_env_path, extra="allow")

    mongodb_url: str = Field(default="mongodb://localhost:27017/task-management-1")
    secret_key: str = Field(
        default="dws-secret-key-change-in-production",
        validation_alias=AliasChoices("JWT_SECRET", "SECRET_KEY")
    )
    algorithm: str = Field(
        default="HS256",
        validation_alias=AliasChoices("JWT_ALGORITHM", "ALGORITHM")
    )
    access_token_expire_minutes: int = Field(
        default=1440,
        validation_alias=AliasChoices("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "ACCESS_TOKEN_EXPIRE_MINUTES")
    )
    openai_api_key: str = ""
    openai_model: str = "gpt-4.1-nano"
    ai_project_interval_hours: int = 48
    ai_admin_interval_hours: int = 72
    ai_scheduler_poll_seconds: int = 600
    ai_project_batch_size: int = 3
    ai_project_task_limit: int = 40
    ai_insights_jitter_minutes: int = 360
    ai_scheduler_enabled: bool = True

    # Aliases for JWT settings
    @property
    def jwt_secret(self) -> str:
        return self.secret_key

    @property
    def jwt_algorithm(self) -> str:
        return self.algorithm

    @computed_field
    def resolved_database_name(self) -> str:
        return _db_name_from_uri(self.mongodb_url)


@lru_cache()
def get_settings():
    return Settings()


settings = get_settings()
