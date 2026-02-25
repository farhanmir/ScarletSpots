from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from app.core.config import settings
from app.core.logger import get_logger

log = get_logger(__name__)

security = HTTPBearer()

_supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
_admin_supabase: Client = None


from supabase import create_client, Client
from supabase.lib.client_options import ClientOptions

def get_supabase() -> Client:
    """Return the shared Supabase client."""
    return _supabase

def get_admin_supabase() -> Client:
    """Return the admin Supabase client with service role."""
    global _admin_supabase
    if _admin_supabase is None:
        if not settings.SUPABASE_SERVICE_ROLE_KEY:
            raise HTTPException(
                status_code=500,
                detail="SUPABASE_SERVICE_ROLE_KEY is not configured in environment variables."
            )
        _admin_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    return _admin_supabase

def get_auth_db(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Client:
    """Return an authenticated Supabase client for the current request."""
    token = credentials.credentials
    opts = ClientOptions()
    db = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY, options=opts)
    db.postgrest.auth(token)
    return db


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """Validate Supabase JWT via the Auth API (works with any signing algo)."""
    token = credentials.credentials
    try:
        resp = _supabase.auth.get_user(token)
        return resp.user
    except Exception as exc:
        log.warning("Auth failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
