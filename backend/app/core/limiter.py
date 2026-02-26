from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def _get_user_or_ip_key(request: Request) -> str:
    """
    Key rate limiting on user_id when available (authenticated routes),
    falling back to remote IP address for anonymous endpoints.
    This prevents campus NAT users (e.g. Rutgers eduroam) from
    being cross-throttled.
    """
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        return str(user_id)
    return get_remote_address(request)


limiter = Limiter(key_func=_get_user_or_ip_key)
