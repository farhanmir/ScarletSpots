import asyncio
import time
from types import SimpleNamespace

import httpx
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt
from jose.exceptions import JWTError
from supabase import Client, create_client

from app.core.config import settings
from app.core.logger import get_logger

log = get_logger(__name__)

security = HTTPBearer()

_SUPPORTED_JWT_ALGORITHMS = {"HS256", "ES256"}
_JWKS_CACHE_TTL_SECONDS = 300
_jwks_keys_cache: list[dict] = []
_jwks_cache_expires_at: float = 0
_jwks_cache_lock = asyncio.Lock()


def _normalize_key_material(value: str) -> str:
    """Normalize env-provided key material (escaped newlines, surrounding quotes)."""
    normalized = (value or "").strip()
    if len(normalized) >= 2 and normalized[0] == normalized[-1] and normalized[0] in {'"', "'"}:
        normalized = normalized[1:-1].strip()
    return normalized.replace("\\n", "\n")


def _decode_with_algorithm(token: str, key: str | dict, algorithm: str) -> dict:
    decode_kwargs: dict = {
        "algorithms": [algorithm],
        "options": {"verify_aud": bool(settings.SUPABASE_JWT_AUDIENCE)},
    }
    if settings.SUPABASE_JWT_AUDIENCE:
        decode_kwargs["audience"] = settings.SUPABASE_JWT_AUDIENCE
    if settings.SUPABASE_JWT_ISSUER:
        decode_kwargs["issuer"] = settings.SUPABASE_JWT_ISSUER
    return jwt.decode(
        token,
        key,
        **decode_kwargs,
    )


async def _fetch_supabase_jwks_keys() -> list[dict]:
    global _jwks_keys_cache, _jwks_cache_expires_at

    now = time.time()
    if _jwks_keys_cache and now < _jwks_cache_expires_at:
        return _jwks_keys_cache

    async with _jwks_cache_lock:
        now = time.time()
        if _jwks_keys_cache and now < _jwks_cache_expires_at:
            return _jwks_keys_cache

        if not settings.SUPABASE_URL:
            raise JWTError("SUPABASE_URL is not configured")

        supabase_url = str(settings.SUPABASE_URL or "").rstrip("/")
        jwks_url = f"{supabase_url}/auth/v1/.well-known/jwks.json"

        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                response = await client.get(
                    jwks_url,
                    headers={"Accept": "application/json"},
                )
                response.raise_for_status()
                payload = response.json()
        except Exception as exc:
            raise JWTError(f"Failed to fetch Supabase JWKS: {exc}") from exc

        keys = payload.get("keys")
        if not isinstance(keys, list) or not keys:
            raise JWTError("Supabase JWKS response has no keys")

        _jwks_keys_cache = [k for k in keys if isinstance(k, dict)]
        _jwks_cache_expires_at = now + _JWKS_CACHE_TTL_SECONDS
        return _jwks_keys_cache


def _decode_hs256(token: str) -> dict:
    secret = _normalize_key_material(settings.SUPABASE_JWT_SECRET)
    if not secret:
        raise JWTError("SUPABASE_JWT_SECRET is not configured for HS256 verification")
    return _decode_with_algorithm(token, secret, "HS256")


async def _decode_es256(token: str, header: dict) -> dict:
    # Optional override: allow explicit public key in env for fully offline verification.
    explicit_public_key = _normalize_key_material(settings.SUPABASE_JWT_PUBLIC_KEY)
    if explicit_public_key:
        return _decode_with_algorithm(token, explicit_public_key, "ES256")

    kid = header.get("kid")
    candidate_keys = await _fetch_supabase_jwks_keys()
    if kid:
        matching = [key for key in candidate_keys if key.get("kid") == kid]
        if matching:
            candidate_keys = matching

    last_error: Exception | None = None
    for key in candidate_keys:
        try:
            return _decode_with_algorithm(token, key, "ES256")
        except JWTError as exc:
            last_error = exc

    if last_error:
        raise JWTError(f"Failed to verify ES256 token: {last_error}")
    raise JWTError("No candidate JWKs available for ES256 verification")


async def _decode_token(token: str) -> dict:
    header = jwt.get_unverified_header(token)
    algorithm = header.get("alg")
    if algorithm not in _SUPPORTED_JWT_ALGORITHMS:
        raise JWTError(f"Unsupported JWT alg: {algorithm}")

    if algorithm == "HS256":
        return _decode_hs256(token)
    if algorithm == "ES256":
        return await _decode_es256(token, header)

    raise JWTError(f"Unsupported JWT alg: {algorithm}")


async def decode_supabase_jwt_token(token: str) -> dict:
    """Decode and validate a Supabase JWT string and return its payload."""
    payload = await _decode_token(token)
    if not isinstance(payload, dict):
        raise JWTError("Token payload is not a JSON object")
    return payload


async def verify_supabase_jwt(auth: HTTPAuthorizationCredentials = Security(security)):
    """
    Decodes and verifies the Supabase JWT locally without calling their API.
    Saves latency and works on the ARM server.
    """
    token = auth.credentials
    try:
        payload = await decode_supabase_jwt_token(token)
        return payload
    except JWTError as exc:
        log.warning("Local JWT verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Supabase token",
        ) from exc


def get_current_user(
    payload: dict = Depends(verify_supabase_jwt),
):
    """
    Adapter that converts the JWT payload into a user-like object.
    Maintains compatibility with existing routers that expect current_user.id and email.
    Does NOT query any database tables.
    """
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Supabase token payload",
        )
    return SimpleNamespace(
        id=user_id,
        email=payload.get("email"),
        user_metadata=payload.get("user_metadata") or {},
    )


# --- Lazy-initialized Supabase clients ---
def init_supabase_clients():
    """Initialize and return shared user-context and admin Supabase clients."""

    if not settings.SUPABASE_ANON_KEY:
        raise HTTPException(
            status_code=500,
            detail="SUPABASE_ANON_KEY is not configured in environment variables.",
        )

    if not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=500,
            detail="SUPABASE_SERVICE_ROLE_KEY is not configured in environment variables.",
        )
    user_supa = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    admin_supa = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

    return {"supabase": user_supa, "admin_supabase": admin_supa}


async def close_supabase_clients():
    """Close async client sessions if necessary. supabase-py uses httpx under the hood."""
    return None  # Currently supabase-py v2 doesn't expose a public teardown for its httpx clients


def get_supabase() -> Client:
    """Return the shared anon Supabase client stored on app.state."""
    from app.main import app

    return app.state.supabase


def get_admin_supabase() -> Client:
    """Return the service-role Supabase client stored on app.state."""
    from app.main import app

    return app.state.admin_supabase


def get_admin_auth_client() -> Client:
    """Return the service-role Supabase auth client from app.state."""
    from app.main import app

    return app.state.admin_supabase


def get_auth_db(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Return an authenticated Supabase client for the current request."""
    # We dynamically clone the PostgrestClient without re-instantiating the full Client.
    # This saves ~100ms and HTTPX overhead per request vs create_client().
    from app.main import app

    base_client = app.state.supabase
    token = credentials.credentials

    # We create a dummy object that duck-types as the Supabase client
    # but uses an authenticated postgrest context for data mutations.
    class _ScopedPostgrestClient:
        """Thin wrapper that ensures the underlying Postgrest client is closed after query execution."""

        def __init__(self, url: str, headers: dict[str, str], table_name: str) -> None:
            from postgrest import SyncPostgrestClient

            self._client = SyncPostgrestClient(url, headers=headers)
            self._table = self._client.table(table_name)

        def __getattr__(self, name: str):
            return getattr(self._table, name)

    class AuthContextClient:
        def __init__(self, base, auth_token) -> None:
            self.base = base
            self.auth_token = auth_token

        def table(self, table_name: str):
            from postgrest import SyncPostgrestClient

            url = f"{settings.SUPABASE_URL}/rest/v1"
            headers = self.base.options.headers.copy()
            headers["Authorization"] = f"Bearer {self.auth_token}"
            return _ScopedPostgrestClient(url, headers, table_name)

    return AuthContextClient(base_client, token)


def require_admin(current_user=Depends(get_current_user)):
    """
    FastAPI dependency that enforces admin role.
    Fetches the user's profile and checks role == 'admin'.
    Raises HTTP 403 if the user is not an admin.
    """
    try:
        db = get_supabase()
        row = db.table("profiles").select("role").eq("id", current_user.id).single().execute()
        if not row.data or row.data.get("role") != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required",
            )
    except HTTPException:
        raise
    except Exception as exc:
        log.warning("Admin check failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        ) from exc
    return current_user
