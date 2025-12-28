from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from pydantic import Field, computed_field
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
    secret_key: str = "dws-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    openai_api_key: str = ""

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
