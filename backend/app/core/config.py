from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "ScarletSpots API"
    VERSION: str = "0.1.0"

    # ---------------------------------------------------------------------------
    # Logto OIDC auth
    # ---------------------------------------------------------------------------
    # Internal URL (used by backend container to reach Logto service)
    LOGTO_ENDPOINT: str = Field(default="")
    # Optional explicit issuer override.
    # If empty, derived as {LOGTO_ENDPOINT}/oidc
    # Set this to the PUBLIC URL of Logto so it matches the `iss` claim in tokens
    # e.g.  http://193.122.155.58:3001/oidc
    LOGTO_ISSUER: str = Field(default="")
    # Audience expected in access tokens (your M2M or web app resource indicator)
    LOGTO_AUDIENCE: str = Field(default="")
    LOGTO_VERIFY_AUDIENCE: bool = Field(default=False)

    # ---------------------------------------------------------------------------
    # Logto Machine-to-Machine app (backend admin operations)
    # ---------------------------------------------------------------------------
    LOGTO_M2M_APP_ID: str = Field(default="")
    LOGTO_M2M_APP_SECRET: str = Field(default="")
    # Management API resource identifier (default for self-hosted Logto)
    LOGTO_MANAGEMENT_API_RESOURCE: str = Field(
        default="https://default.logto.app/api"
    )

    DATABASE_URL: str = Field(default="")
    EXPO_PUSH_ACCESS_TOKEN: str = Field(default="")

    # Redis
    REDIS_URL: str = Field(default="redis://localhost:6379/0")

    # CORS
    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:8081",
        "http://localhost:5173",
        "http://localhost:19006",
    ]


settings = Settings()
