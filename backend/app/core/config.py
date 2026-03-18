from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "ScarletSpots API"
    VERSION: str = "0.1.0"


    # Keycloak auth
    KEYCLOAK_URL: str = Field(default="")
    KEYCLOAK_REALM: str = Field(default="")
    KEYCLOAK_ISSUER: str = Field(default="")
    KEYCLOAK_AUDIENCE: str = Field(default="")
    KEYCLOAK_VERIFY_AUDIENCE: bool = Field(default=True)
    KEYCLOAK_JWT_PUBLIC_KEY: str = Field(default="")

    # Keycloak admin client (for signup/password-reset flows)
    KEYCLOAK_ADMIN_CLIENT_ID: str = Field(default="")
    KEYCLOAK_ADMIN_CLIENT_SECRET: str = Field(default="")
    KEYCLOAK_PASSWORD_RESET_CLIENT_ID: str = Field(default="")
    KEYCLOAK_PASSWORD_RESET_REDIRECT_URI: str = Field(default="")

    DATABASE_URL: str = Field(default="")
    EXPO_PUSH_ACCESS_TOKEN: str = Field(default="")

    # Redis (local, no auth by default)
    REDIS_URL: str = Field(default="redis://localhost:6379/0")

    # CORS
    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:8081",
        "http://localhost:5173",
        "http://localhost:19006",
    ]


settings = Settings()
