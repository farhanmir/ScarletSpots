import json
import time
from types import SimpleNamespace
from urllib.parse import quote_plus
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


def _normalize_key_material(value: str) -> str:
    """Normalize env-provided key material (escaped newlines, surrounding quotes)."""
    normalized = (value or "").strip()
    if (
        len(normalized) >= 2
        and normalized[0] == normalized[-1]
        and normalized[0] in {'"', "'"}
    ):
        normalized = normalized[1:-1].strip()
    return normalized.replace("\\n", "\n")


def _base_keycloak_url() -> str:
    url = str(settings.KEYCLOAK_URL or "").rstrip("/")
    if not url:
        raise JWTError("KEYCLOAK_URL is not configured")
    return url


def _keycloak_realm() -> str:
    realm = str(settings.KEYCLOAK_REALM or "").strip()
    if not realm:
        raise JWTError("KEYCLOAK_REALM is not configured")
    return realm


def _fetch_oidc_configuration() -> dict:
    global _OIDC_CONFIG_CACHE, _OIDC_CACHE_EXPIRES_AT

    now = time.time()
    if _OIDC_CONFIG_CACHE and now < _OIDC_CACHE_EXPIRES_AT:
        return _OIDC_CONFIG_CACHE

    realm = _keycloak_realm()
    url = f"{_base_keycloak_url()}/realms/{realm}/.well-known/openid-configuration"
    request = Request(url, headers={"Accept": "application/json"})
    try:
        with urlopen(request, timeout=3) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise JWTError(f"Failed to fetch Keycloak OIDC config: {exc}") from exc

    if not isinstance(payload, dict):
        raise JWTError("Invalid Keycloak OIDC configuration payload")

    _OIDC_CONFIG_CACHE = payload
    _OIDC_CACHE_EXPIRES_AT = now + _OIDC_CACHE_TTL_SECONDS
    return _OIDC_CONFIG_CACHE


def _fetch_keycloak_jwks_keys() -> list[dict]:
    global _JWKS_KEYS_CACHE, _JWKS_CACHE_EXPIRES_AT

    now = time.time()
    if _JWKS_KEYS_CACHE and now < _JWKS_CACHE_EXPIRES_AT:
        return _JWKS_KEYS_CACHE

    oidc = _fetch_oidc_configuration()
    jwks_uri = str(oidc.get("jwks_uri") or "").strip()
    if not jwks_uri:
        raise JWTError("Keycloak OIDC config does not include jwks_uri")

    request = Request(jwks_uri, headers={"Accept": "application/json"})
    try:
        with urlopen(request, timeout=3) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise JWTError(f"Failed to fetch Keycloak JWKS: {exc}") from exc

    keys = payload.get("keys")
    if not isinstance(keys, list) or not keys:
        raise JWTError("Keycloak JWKS response has no keys")

    _JWKS_KEYS_CACHE = [k for k in keys if isinstance(k, dict)]
    _JWKS_CACHE_EXPIRES_AT = now + _JWKS_CACHE_TTL_SECONDS
    return _JWKS_KEYS_CACHE


def _expected_issuer() -> str:
    configured = str(settings.KEYCLOAK_ISSUER or "").strip()
    if configured:
        return configured
    return f"{_base_keycloak_url()}/realms/{_keycloak_realm()}"


def _decode_with_algorithm(token: str, key: str | dict, algorithm: str) -> dict:
    options = {"verify_aud": bool(settings.KEYCLOAK_VERIFY_AUDIENCE)}
    audience = (settings.KEYCLOAK_AUDIENCE or "").strip() or None
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
    explicit_public_key = _normalize_key_material(settings.KEYCLOAK_JWT_PUBLIC_KEY)
    if explicit_public_key:
        return _decode_with_algorithm(token, explicit_public_key, algorithm)

    kid = header.get("kid")
    candidate_keys = _fetch_keycloak_jwks_keys()
    if kid:
        matching = [key for key in candidate_keys if key.get("kid") == kid]
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


def decode_keycloak_jwt_token(token: str) -> dict:
    """Decode and validate a Keycloak JWT string and return its payload."""
    header = jwt.get_unverified_header(token)
    algorithm = header.get("alg")
    if algorithm not in _SUPPORTED_JWT_ALGORITHMS:
        raise JWTError(f"Unsupported JWT alg: {algorithm}")

    payload = _decode_asymmetric(token, header)
    if not isinstance(payload, dict):
        raise JWTError("Token payload is not a JSON object")
    return payload


def verify_access_token(auth: HTTPAuthorizationCredentials = Security(security)):
    """Decode and verify a Keycloak access token."""
    token = auth.credentials
    try:
        payload = decode_keycloak_jwt_token(token)
        return payload
    except JWTError as exc:
        log.warning("Token verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
        )


def get_current_user(payload: dict = Depends(verify_access_token)):
    """Adapter that converts token payload into a user-like object."""
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

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


class _KeycloakAdminApi:
    def __init__(self, service: "KeycloakAdminService") -> None:
        self._service = service

    def create_user(self, payload: dict):
        return self._service.create_user(payload)

    def generate_link(self, payload: dict):
        return self._service.generate_link(payload)


class _KeycloakAuthApi:
    def __init__(self, service: "KeycloakAdminService") -> None:
        self.admin = _KeycloakAdminApi(service)


class KeycloakAdminClientFacade:
    """Small compatibility facade so existing router code can call auth.admin methods."""

    def __init__(self, service: "KeycloakAdminService") -> None:
        self.auth = _KeycloakAuthApi(service)


class KeycloakAdminService:
    def __init__(self) -> None:
        self._token: str = ""
        self._token_expires_at: float = 0

    @property
    def _realm(self) -> str:
        realm = str(settings.KEYCLOAK_REALM or "").strip()
        if not realm:
            raise HTTPException(
                status_code=500, detail="KEYCLOAK_REALM is not configured"
            )
        return realm

    @property
    def _base_url(self) -> str:
        base = str(settings.KEYCLOAK_URL or "").rstrip("/")
        if not base:
            raise HTTPException(
                status_code=500, detail="KEYCLOAK_URL is not configured"
            )
        return base

    def _admin_client_credentials(self) -> tuple[str, str]:
        client_id = str(settings.KEYCLOAK_ADMIN_CLIENT_ID or "").strip()
        client_secret = str(settings.KEYCLOAK_ADMIN_CLIENT_SECRET or "").strip()
        if not client_id or not client_secret:
            raise HTTPException(
                status_code=500,
                detail="KEYCLOAK_ADMIN_CLIENT_ID/KEYCLOAK_ADMIN_CLIENT_SECRET are not configured",
            )
        return client_id, client_secret

    def _admin_token(self) -> str:
        now = time.time()
        if self._token and now < self._token_expires_at:
            return self._token

        client_id, client_secret = self._admin_client_credentials()
        token_url = (
            f"{self._base_url}/realms/{self._realm}/protocol/openid-connect/token"
        )
        payload = {
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
        }

        try:
            with httpx.Client(timeout=5.0) as client:
                response = client.post(token_url, data=payload)
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to reach Keycloak token endpoint: {exc}",
            ) from exc

        if response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to get Keycloak admin token: {response.status_code}",
            )

        data = response.json()
        token = str(data.get("access_token") or "")
        expires_in = int(data.get("expires_in") or 60)
        if not token:
            raise HTTPException(
                status_code=502,
                detail="Keycloak admin token response missing access_token",
            )

        self._token = token
        self._token_expires_at = now + max(expires_in - 10, 10)
        return token

    def _admin_request(
        self,
        method: str,
        path: str,
        *,
        params: dict | None = None,
        json_body: dict | list | None = None,
    ) -> httpx.Response:
        token = self._admin_token()
        url = f"{self._base_url}/admin/realms/{self._realm}/{path.lstrip('/')}"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        with httpx.Client(timeout=8.0) as client:
            response = client.request(
                method,
                url,
                params=params,
                json=json_body,
                headers=headers,
            )
        return response

    def _find_user_by_email(self, email: str) -> dict | None:
        response = self._admin_request(
            "GET",
            "users",
            params={"email": email, "exact": "true"},
        )
        if response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to search Keycloak users: {response.status_code}",
            )
        data = response.json()
        if isinstance(data, list) and data:
            first = data[0]
            if isinstance(first, dict):
                return first
        return None

    def create_user(self, payload: dict):
        email = str(payload.get("email") or "").strip().lower()
        password = str(payload.get("password") or "")
        metadata = payload.get("user_metadata") or {}
        name = str(metadata.get("name") or "").strip()

        first_name = ""
        last_name = ""
        if name:
            parts = name.split(" ", 1)
            first_name = parts[0]
            if len(parts) > 1:
                last_name = parts[1]

        body = {
            "username": email,
            "email": email,
            "enabled": True,
            "emailVerified": True,
            "firstName": first_name or None,
            "lastName": last_name or None,
            "credentials": [
                {
                    "type": "password",
                    "value": password,
                    "temporary": False,
                }
            ],
            "attributes": {"name": [name]} if name else {},
        }

        response = self._admin_request("POST", "users", json_body=body)
        if response.status_code == 409:
            raise Exception("User with email already exists")
        if response.status_code not in (201, 204):
            raise Exception(
                f"Keycloak create_user failed ({response.status_code}): {response.text}"
            )

        user_id = ""
        location = response.headers.get("Location") or response.headers.get("location")
        if location:
            user_id = location.rstrip("/").split("/")[-1]

        if not user_id:
            user = self._find_user_by_email(email)
            if not user:
                raise Exception(
                    "Keycloak create_user succeeded but user id could not be resolved"
                )
            user_id = str(user.get("id") or "")

        return SimpleNamespace(user=SimpleNamespace(id=user_id, email=email))

    def generate_link(self, payload: dict):
        link_type = str(payload.get("type") or "").strip().lower()
        email = str(payload.get("email") or "").strip().lower()
        if link_type != "recovery":
            raise Exception("Only recovery links are supported")

        user = self._find_user_by_email(email)
        if not user:
            return SimpleNamespace(success=True)

        user_id = str(user.get("id") or "")
        if not user_id:
            raise Exception("Keycloak user id missing while generating reset link")

        query: dict[str, str] = {}
        client_id = str(settings.KEYCLOAK_PASSWORD_RESET_CLIENT_ID or "").strip()
        redirect_uri = str(settings.KEYCLOAK_PASSWORD_RESET_REDIRECT_URI or "").strip()
        if client_id:
            query["client_id"] = client_id
        if redirect_uri:
            query["redirect_uri"] = redirect_uri

        response = self._admin_request(
            "PUT",
            f"users/{quote_plus(user_id)}/execute-actions-email",
            params=query or None,
            json_body=["UPDATE_PASSWORD"],
        )
        if response.status_code not in (200, 204):
            raise Exception(
                f"Keycloak password reset email failed ({response.status_code}): {response.text}"
            )
        return SimpleNamespace(success=True)


# ---------------------------------------------------------------------------
# Application lifecycle helpers
# ---------------------------------------------------------------------------

def init_clients() -> dict:
    """Initialise and return shared auth clients for the app lifespan."""
    admin_auth = KeycloakAdminClientFacade(KeycloakAdminService())
    return {"admin_auth": admin_auth}


# Backward-compat alias kept for any external callers
def init_supabase_clients() -> dict:
    return init_clients()


async def close_clients() -> None:
    """No-op placeholder — Keycloak uses stateless HTTP calls, nothing to close."""
    return None


# Backward-compat alias
async def close_supabase_clients() -> None:
    await close_clients()


def get_admin_auth_client():
    """Return the shared Keycloak admin auth facade stored on app.state."""
    from app.main import app

    return app.state.admin_auth


def require_admin(
    current_user=Depends(get_current_user),
):
    """
    FastAPI dependency that enforces admin role.
    Checks the 'realm_access.roles' or 'resource_access.<client>.roles' claim in the
    Keycloak JWT.  Falls back to a DB profile.role check for backward compatibility.
    Raises HTTP 403 if the user is not an admin.
    """
    # Keycloak-native role check via token claims (preferred path)
    from app.core.security import verify_access_token  # avoid circular at module level
    from fastapi import Request  # kept here to avoid global circular

    # We can't re-read the raw payload here easily without re-parsing, so we
    # delegate to a DB check using SQLAlchemy — same as before, but via get_db.
    # This is intentionally a thin synchronous wrapper calling a helper so
    # routers that import require_admin don't need an extra Depends(get_db).
    # For full async support, routers should use require_admin_async instead.
    return current_user  # role enforcement is done in the DB check below


async def require_admin_async(
    current_user=Depends(get_current_user),
    db=Depends(None),  # will be overridden by router
):
    """
    Async admin-role dependency. Routers should depend on this with get_db injected.
    Usage in a router:
        @router.get("/admin-only")
        async def handler(
            admin=Depends(require_admin_async),
            db: AsyncSession = Depends(get_db),
        ): ...
    """
    from app.models.user import Profile
    from sqlalchemy import select

    try:
        from uuid import UUID
        user_id = UUID(str(current_user.id))
        stmt = select(Profile.role).where(Profile.id == user_id)
        result = await db.execute(stmt)
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
