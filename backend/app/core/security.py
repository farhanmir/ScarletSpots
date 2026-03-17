from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from types import SimpleNamespace
from jose import jwt
from app.core.config import settings
from app.core.logger import get_logger
from supabase import Client, create_client

log = get_logger(__name__)

security = HTTPBearer()

def verify_supabase_jwt(auth: HTTPAuthorizationCredentials = Security(security)):
    """
    Decodes and verifies the Supabase JWT locally without calling their API.
    Saves latency and works on the ARM server.
    """
    token = auth.credentials
    try:
        # This decodes and verifies the token locally using the SUPABASE_JWT_SECRET
        payload = jwt.decode(
            token, 
            settings.SUPABASE_JWT_SECRET, 
            algorithms=["HS256"], 
            audience="authenticated"
        )
        return payload
    except Exception as exc:
        log.warning("Local JWT verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Invalid or expired Supabase token"
        )

def get_current_user(
    payload: dict = Depends(verify_supabase_jwt),
):
    """
    Adapter that converts the JWT payload into a user-like object.
    Maintains compatibility with existing routers that expect current_user.id and email.
    Does NOT query any database tables.
    """
    return SimpleNamespace(
        id=payload.get("sub"),
        email=payload.get("email"),
        user_metadata=payload.get("user_metadata", {})
    )


# --- Lazy-initialized Supabase clients ---
def init_supabase_clients():
    """Initializes and returns shared Supabase clients for the process."""

    # Standard client
    supa = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

    # Admin client
    if not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=500,
            detail="SUPABASE_SERVICE_ROLE_KEY is not configured in environment variables.",
        )
    admin_supa = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

    return {"supabase": supa, "admin_supabase": admin_supa}


async def close_supabase_clients():
    """Close async client sessions if necessary. supabase-py uses httpx under the hood."""
    pass  # Currently supabase-py v2 doesn't expose a public teardown for its httpx clients


def get_supabase() -> Client:
    """Return the shared Supabase client stored on app.state."""
    from app.main import app

    return app.state.supabase


def get_admin_supabase() -> Client:
    """Return the admin Supabase client stored on app.state."""
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
    class AuthContextClient:
        def __init__(self, base, auth_token):
            self.base = base
            self.auth_token = auth_token

        def table(self, table_name: str):
            # The base postgrest client can be cloned or its auth headers updated.
            # To be thread-safe in async context, we must instantiate a new postgrest client block.
            from postgrest import SyncPostgrestClient

            url = f"{settings.SUPABASE_URL}/rest/v1"
            headers = self.base.options.headers.copy()
            headers["Authorization"] = f"Bearer {self.auth_token}"
            pg = SyncPostgrestClient(url, headers=headers)
            return pg.table(table_name)

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
        )
    return current_user
