import json
import time
from types import SimpleNamespace
from urllib.request import Request, urlopen

import httpx
from app.core.config import settings
from app.core.logger import get_logger
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt
from jose.exceptions import JWTError

log = get_logger(__name__)

security = HTTPBearer()

_SUPPORTED_JWT_ALGORITHMS = {"RS256", "ES256"}
_JWKS_CACHE_TTL_SECONDS = 300
_OIDC_CACHE_TTL_SECONDS = 300
_JWKS_KEYS_CACHE: list[dict] = []
_JWKS_CACHE_EXPIRES_AT: float = 0
_OIDC_CONFIG_CACHE: dict = {}
_OIDC_CACHE_EXPIRES_AT: float = 0


# ---------------------------------------------------------------------------
# Logto OIDC helpers
# ---------------------------------------------------------------------------


def _logto_endpoint() -> str:
    url = str(settings.LOGTO_ENDPOINT or "").rstrip("/")
    if not url:
        raise JWTError("LOGTO_ENDPOINT is not configured")
    return url


def _fetch_oidc_configuration() -> dict:
    global _OIDC_CONFIG_CACHE, _OIDC_CACHE_EXPIRES_AT

    now = time.time()
    if _OIDC_CONFIG_CACHE and now < _OIDC_CACHE_EXPIRES_AT:
        return _OIDC_CONFIG_CACHE

    # Logto OIDC discovery endpoint
    url = f"{_logto_endpoint()}/oidc/.well-known/openid-configuration"
    request = Request(url, headers={"Accept": "application/json"})
    try:
        with urlopen(request, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise JWTError(f"Failed to fetch Logto OIDC config: {exc}") from exc

    if not isinstance(payload, dict):
        raise JWTError("Invalid Logto OIDC configuration payload")

    _OIDC_CONFIG_CACHE = payload
    _OIDC_CACHE_EXPIRES_AT = now + _OIDC_CACHE_TTL_SECONDS
    return _OIDC_CONFIG_CACHE


def _fetch_jwks_keys() -> list[dict]:
    global _JWKS_KEYS_CACHE, _JWKS_CACHE_EXPIRES_AT

    now = time.time()
    if _JWKS_KEYS_CACHE and now < _JWKS_CACHE_EXPIRES_AT:
        return _JWKS_KEYS_CACHE

    oidc = _fetch_oidc_configuration()
    jwks_uri = str(oidc.get("jwks_uri") or "").strip()
    if not jwks_uri:
        raise JWTError("Logto OIDC config does not include jwks_uri")

    request = Request(jwks_uri, headers={"Accept": "application/json"})
    try:
        with urlopen(request, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise JWTError(f"Failed to fetch Logto JWKS: {exc}") from exc

    keys = payload.get("keys")
    if not isinstance(keys, list) or not keys:
        raise JWTError("Logto JWKS response has no keys")

    _JWKS_KEYS_CACHE = [k for k in keys if isinstance(k, dict)]
    _JWKS_CACHE_EXPIRES_AT = now + _JWKS_CACHE_TTL_SECONDS
    return _JWKS_KEYS_CACHE


def _expected_issuer() -> str:
    """
    Logto issuer is {LOGTO_ENDPOINT}/oidc
    But if SERVER_HOST differs from the internal Docker service name,
    LOGTO_ISSUER must be set explicitly to match the public URL in tokens.
    """
    configured = str(settings.LOGTO_ISSUER or "").strip()
    if configured:
        return configured
    return f"{_logto_endpoint()}/oidc"


def _decode_with_algorithm(token: str, key: str | dict, algorithm: str) -> dict:
    options = {"verify_aud": bool(settings.LOGTO_VERIFY_AUDIENCE)}
    audience = (settings.LOGTO_AUDIENCE or "").strip() or None
    return jwt.decode(
        token,
        key,
        algorithms=[algorithm],
        audience=audience,
        issuer=_expected_issuer(),
        options=options,
    )


def _decode_asymmetric(token: str, header: dict) -> dict:
    algorithm = str(header.get("alg") or "")
    kid = header.get("kid")
    candidate_keys = _fetch_jwks_keys()
    if kid:
        matching = [k for k in candidate_keys if k.get("kid") == kid]
        if matching:
            candidate_keys = matching

    last_error: Exception | None = None
    for key in candidate_keys:
        try:
            return _decode_with_algorithm(token, key, algorithm)
        except JWTError as exc:
            last_error = exc

    if last_error:
        raise JWTError(f"Failed to verify token: {last_error}")
    raise JWTError("No candidate JWKs available for verification")


def decode_logto_jwt_token(token: str) -> dict:
    """Decode and validate a Logto JWT string and return its payload."""
    header = jwt.get_unverified_header(token)
    algorithm = header.get("alg")
    if algorithm not in _SUPPORTED_JWT_ALGORITHMS:
        raise JWTError(f"Unsupported JWT alg: {algorithm}")
    payload = _decode_asymmetric(token, header)
    if not isinstance(payload, dict):
        raise JWTError("Token payload is not a JSON object")
    return payload


# Backward-compat alias for legacy imports.
def decode_keycloak_jwt_token(token: str) -> dict:
    return decode_logto_jwt_token(token)


def verify_access_token(auth: HTTPAuthorizationCredentials = Security(security)):
    """Decode and verify a Logto access token."""
    token = auth.credentials
    try:
        payload = decode_logto_jwt_token(token)
        return payload
    except JWTError as exc:
        log.warning("Token verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
        )


def get_current_user(payload: dict = Depends(verify_access_token)):
    """Convert Logto token payload into a user-like object."""
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    # Logto includes standard OIDC claims when profile/email scopes granted
    full_name = payload.get("name")
    given_name = payload.get("given_name")
    family_name = payload.get("family_name")
    metadata = {
        "name": full_name,
        "first_name": given_name,
        "last_name": family_name,
    }
    return SimpleNamespace(
        id=user_id,
        email=payload.get("email"),
        user_metadata={k: v for k, v in metadata.items() if v is not None},
    )


# ---------------------------------------------------------------------------
# Logto Management API service
# ---------------------------------------------------------------------------


class LogtoManagementService:
    """Calls the Logto Management API using M2M client_credentials token."""

    def __init__(self) -> None:
        self._token: str = ""
        self._token_expires_at: float = 0

    @property
    def _endpoint(self) -> str:
        base = str(settings.LOGTO_ENDPOINT or "").rstrip("/")
        if not base:
            raise HTTPException(
                status_code=500, detail="LOGTO_ENDPOINT is not configured"
            )
        return base

    def _m2m_credentials(self) -> tuple[str, str]:
        app_id = str(settings.LOGTO_M2M_APP_ID or "").strip()
        app_secret = str(settings.LOGTO_M2M_APP_SECRET or "").strip()
        if not app_id or not app_secret:
            raise HTTPException(
                status_code=500,
                detail="LOGTO_M2M_APP_ID / LOGTO_M2M_APP_SECRET are not configured",
            )
        return app_id, app_secret

    def _m2m_token(self) -> str:
        now = time.time()
        if self._token and now < self._token_expires_at:
            return self._token

        app_id, app_secret = self._m2m_credentials()
        resource = str(
            settings.LOGTO_MANAGEMENT_API_RESOURCE or "https://default.logto.app/api"
        ).strip()
        token_url = f"{self._endpoint}/oidc/token"

        try:
            with httpx.Client(timeout=5.0) as client:
                response = client.post(
                    token_url,
                    data={
                        "grant_type": "client_credentials",
                        "client_id": app_id,
                        "client_secret": app_secret,
                        "resource": resource,
                        "scope": "all",
                    },
                )
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to reach Logto token endpoint: {exc}",
            ) from exc

        if response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"Logto M2M token failed ({response.status_code}): {response.text[:200]}",
            )

        data = response.json()
        token = str(data.get("access_token") or "")
        expires_in = int(data.get("expires_in") or 60)
        if not token:
            raise HTTPException(
                status_code=502, detail="Logto M2M response missing access_token"
            )

        self._token = token
        self._token_expires_at = now + max(expires_in - 10, 10)
        return token

    def _api_request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict | list | None = None,
        params: dict | None = None,
    ) -> httpx.Response:
        token = self._m2m_token()
        url = f"{self._endpoint}/api/{path.lstrip('/')}"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        with httpx.Client(timeout=8.0) as client:
            return client.request(
                method, url, json=json_body, params=params, headers=headers
            )

    def _find_user_by_email(self, email: str) -> dict | None:
        response = self._api_request("GET", "users", params={"search": email})
        if response.status_code != 200:
            return None
        data = response.json()
        if isinstance(data, list):
            for user in data:
                if isinstance(user, dict):
                    if user.get("primaryEmail", "").lower() == email.lower():
                        return user
        return None

    def create_user(self, payload: dict):
        email = str(payload.get("email") or "").strip().lower()
        password = str(payload.get("password") or "")
        metadata = payload.get("user_metadata") or {}
        name = str(metadata.get("name") or "").strip()

        body: dict = {"primaryEmail": email}
        if password:
            body["password"] = password
        if name:
            body["name"] = name

        response = self._api_request("POST", "users", json_body=body)

        if response.status_code in (409, 422):
            text = response.text.lower()
            if "exist" in text or "duplicate" in text or "unique" in text:
                raise Exception("User with email already exists")

        if response.status_code not in (200, 201):
            raise Exception(
                f"Logto create_user failed ({response.status_code}): {response.text[:300]}"
            )

        data = response.json()
        user_id = str(data.get("id") or "")
        return SimpleNamespace(user=SimpleNamespace(id=user_id, email=email))

    def generate_link(self, payload: dict):
        """Trigger a password reset email for a Logto user."""
        link_type = str(payload.get("type") or "").strip().lower()
        email = str(payload.get("email") or "").strip().lower()
        if link_type != "recovery":
            raise Exception("Only recovery links are supported")

        user = self._find_user_by_email(email)
        if not user:
            # Silent success to avoid email enumeration
            return SimpleNamespace(success=True)

        user_id = str(user.get("id") or "")

        # Logto v1 Management API: send password reset verification code via email
        response = self._api_request(
            "POST",
            f"users/{user_id}/verification-codes",
            json_body={"type": "ForgotPassword", "email": email},
        )
        # Silently ignore errors to avoid email enumeration
        if response.status_code not in (200, 201, 204):
            log.warning(
                "Logto password reset trigger returned %d for user %s",
                response.status_code,
                user_id,
            )
        return SimpleNamespace(success=True)


# ---------------------------------------------------------------------------
# Compat facade (routers call auth.admin.create_user / auth.admin.generate_link)
# ---------------------------------------------------------------------------


class _LogtoAdminApi:
    def __init__(self, service: LogtoManagementService) -> None:
        self._service = service

    def create_user(self, payload: dict):
        return self._service.create_user(payload)

    def generate_link(self, payload: dict):
        return self._service.generate_link(payload)


class _LogtoAuthApi:
    def __init__(self, service: LogtoManagementService) -> None:
        self.admin = _LogtoAdminApi(service)


class LogtoAdminClientFacade:
    """Compatibility facade matching the shape routers expect."""

    def __init__(self, service: LogtoManagementService) -> None:
        self.auth = _LogtoAuthApi(service)


# ---------------------------------------------------------------------------
# Application lifecycle helpers
# ---------------------------------------------------------------------------


def init_clients() -> dict:
    """Initialise shared auth clients for the app lifespan."""
    admin_auth = LogtoAdminClientFacade(LogtoManagementService())
    return {"admin_auth": admin_auth}


# Backward-compat alias
def init_supabase_clients() -> dict:
    return init_clients()


async def close_clients() -> None:
    """No-op — Logto uses stateless HTTP, nothing to close."""
    return None


async def close_supabase_clients() -> None:
    await close_clients()


def get_admin_auth_client():
    """Return the shared Logto admin facade from app.state."""
    from app.main import app

    return app.state.admin_auth


def require_admin(current_user=Depends(get_current_user)):
    """
    Dependency that enforces admin role via the profiles DB table.
    For async routes that need it with a DB session, use require_admin_async.
    """
    return current_user


async def require_admin_async(
    current_user=Depends(get_current_user),
    db=Depends(None),
):
    """Async admin check via SQLAlchemy profiles table."""
    from uuid import UUID

    from app.models.user import Profile
    from sqlalchemy import select

    try:
        user_id = UUID(str(current_user.id))
        result = await db.execute(select(Profile.role).where(Profile.id == user_id))
        role = result.scalar_one_or_none()
        if role != "admin":
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
        )
    return current_user
    return current_user
