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

    # Supabase
    SUPABASE_URL: str = Field(default="")
    SUPABASE_ANON_KEY: str = Field(default="")
    SUPABASE_SERVICE_ROLE_KEY: str = Field(default="")
    SUPABASE_JWT_SECRET: str = Field(default="")
    SUPABASE_JWT_PUBLIC_KEY: str = Field(default="")
    SUPABASE_JWT_ISSUER: str = Field(default="")
    SUPABASE_JWT_AUDIENCE: str = Field(default="")
    DATABASE_URL: str = Field(default="")
    EXPO_PUSH_ACCESS_TOKEN: str = Field(default="")
    DEBUG: bool = Field(default=False)

    # Redis (local, no auth by default)
    REDIS_URL: str = Field(default="redis://localhost:6379/0")

    # Bootstrap forecasting controls
    ENABLE_HEURISTIC_SEEDED_OCCUPANCY: bool = Field(default=True)
    TRAFFIC_PROVIDER: str = Field(default="none")
    TOMTOM_API_KEY: str = Field(default="")
    TRAFFIC_CACHE_TTL_SECONDS: int = Field(default=300)

    # High-value endpoint controls
    REQUIRE_AUTH_ON_AVAILABILITY: bool = Field(default=True)
    REQUIRE_ATTESTATION_ON_AVAILABILITY: bool = Field(default=False)
    ATTESTATION_ENFORCE: bool = Field(default=False)
    ATTESTATION_ALLOW_GRACE_MINUTES: int = Field(default=10)
    ATTESTATION_NONCE_MAX_AGE_SECONDS: int = Field(default=300)
    ATTESTATION_SIGNING_SECRET: str = Field(default="")

    # CORS
    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:8081",
        "http://localhost:5173",
        "http://localhost:19006",
    ]


settings = Settings()
