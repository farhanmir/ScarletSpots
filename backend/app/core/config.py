import os
from pathlib import Path
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Git SHA baked in by Docker at build time via --build-arg GIT_SHA=<hash>.
# Falls back to "dev" when running locally without the Docker build arg.
GIT_SHA: str = os.environ.get("GIT_SHA", "dev")


def _coerce_diagnostics_allowed_emails(value: Any) -> list[str]:
    """Dotenv delivers a string; pydantic-settings can fail JSON coercion for list[str]. Always normalize here."""
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        raw_values = [str(x) for x in value]
    elif isinstance(value, str):
        stripped = value.strip()
        if len(stripped) >= 2 and stripped[0] == stripped[-1] and stripped[0] in {'"', "'"}:
            stripped = stripped[1:-1]
        raw_values = stripped.split(",") if stripped else []
    else:
        return []

    normalized: list[str] = []
    for raw in raw_values:
        email = str(raw).strip().lower()
        if email and email not in normalized:
            normalized.append(email)
    return normalized


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "ScarletSpots API"
    # Read from backend/VERSION so bumping is a one-line file change, not a code change.
    VERSION: str = (BASE_DIR / "VERSION").read_text(encoding="utf-8").strip()

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
    APNS_KEY_ID: str = Field(default="")
    APNS_TEAM_ID: str = Field(default="")
    APNS_BUNDLE_ID: str = Field(default="")
    APNS_PRIVATE_KEY: str = Field(default="")
    APNS_PRIVATE_KEY_PATH: str = Field(default="")
    APNS_USE_SANDBOX: bool = Field(default=False)
    CAMPUS_TIMEZONE: str = Field(default="America/New_York")
    DEBUG: bool = Field(default=False)
    # Env is a single string; list[str] in .env breaks pydantic-settings dotenv parsing.
    diagnostics_allowed_emails_csv: str = Field(default="", validation_alias="DIAGNOSTICS_ALLOWED_EMAILS")

    # Security dashboard key for abuse metrics endpoint
    SECURITY_DASHBOARD_KEY: str = Field(default="")

    # Redis (local, no auth by default)
    REDIS_URL: str = Field(default="redis://localhost:6379/0")

    # Bootstrap forecasting controls
    ENABLE_HEURISTIC_SEEDED_OCCUPANCY: bool = Field(default=True)
    PREFER_HEURISTIC_FOR_SPARSE_REALTIME: bool = Field(default=True)
    SPARSE_REALTIME_MAX_RATIO: float = Field(default=0.015)
    OCCUPANCY_STALE_MINUTES: int = Field(default=90)
    TRAFFIC_PROVIDER: str = Field(default="none")
    TOMTOM_API_KEY: str = Field(default="")
    TRAFFIC_CACHE_TTL_SECONDS: int = Field(default=300)
    CIRCLING_METRIC_ENABLED: bool = Field(default=True)
    CIRCLING_METRIC_WINDOW_MINUTES: int = Field(default=60)
    SOC_FORECAST_ENABLED: bool = Field(default=False)
    SOC_PRESSURE_STALE_MINUTES: int = Field(default=240)
    SOC_PRESSURE_MIN_MULTIPLIER: float = Field(default=0.80)
    SOC_PRESSURE_MAX_MULTIPLIER: float = Field(default=1.25)

    # High-value endpoint controls
    REQUIRE_AUTH_ON_AVAILABILITY: bool = Field(default=True)
    REQUIRE_ATTESTATION_ON_AVAILABILITY: bool = Field(default=False)
    ATTESTATION_ENFORCE: bool = Field(default=False)
    ATTESTATION_ALLOW_GRACE_MINUTES: int = Field(default=10)
    ATTESTATION_NONCE_MAX_AGE_SECONDS: int = Field(default=300)
    ATTESTATION_TOKEN_TTL_SECONDS: int = Field(default=180)
    ATTESTATION_SIGNING_SECRET: str = Field(default="")

    # CORS
    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:8081",
        "http://localhost:5173",
        "http://localhost:19006",
    ]

    @field_validator("DEBUG", mode="before")
    @classmethod
    def normalize_debug_flag(cls, value):
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "on", "debug"}:
                return True
            if normalized in {"0", "false", "no", "off", "release", ""}:
                return False
        return value

    @property
    def DIAGNOSTICS_ALLOWED_EMAILS(self) -> list[str]:
        """Emails allowed to see in-app diagnostics (comma-separated in env)."""
        return _coerce_diagnostics_allowed_emails(self.diagnostics_allowed_emails_csv)


settings = Settings()
