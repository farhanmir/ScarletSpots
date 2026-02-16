from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from app.core.config import settings
from app.core.logger import get_logger

log = get_logger(__name__)

security = HTTPBearer()

_supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)


def get_supabase() -> Client:
    """Return the shared Supabase client."""
    return _supabase


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
