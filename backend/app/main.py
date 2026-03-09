import sys
import os
import uuid
import traceback

# Add parent directory to path to allow running as script
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.config import settings
from app.core.limiter import limiter
from app.core.logger import logger
from app.routers import users, lots, friends, park, favorites
from contextlib import asynccontextmanager

# FastAPI Lifespan for Supabase Client Pooling
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize shared clients once per process
    from app.core.security import init_supabase_clients, close_supabase_clients
    clients = init_supabase_clients()
    app.state.supabase = clients["supabase"]
    app.state.admin_supabase = clients["admin_supabase"]
    print("!!! BACKEND STARTING UP !!!", flush=True)
    yield

    # Cleanup on shutdown
    await close_supabase_clients()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# Sanitize 500 error responses
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """
    Catch unhandled exceptions, log full stack trace server-side,
    and return a sanitized response to clients. Never leak internals.
    """
    correlation_id = getattr(request.state, "correlation_id", "unknown")
    logger.error(
        "[%s] Unhandled exception: %s\n%s",
        correlation_id,
        exc,
        traceback.format_exc(),
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An internal error occurred.",
            "correlation_id": correlation_id,
        },
    )


# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Correlation ID Middleware
class CorrelationIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4())[:8])
        request.state.correlation_id = correlation_id
        msg = f"[{correlation_id}] {request.method} {request.url.path}"
        # Use sys.stderr and flush=True to bypass potential buffering
        import sys
        print(f"\n>>>>> REQUEST: {msg} <<<<<", file=sys.stderr, flush=True)
        logger.info(msg)
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = correlation_id
        return response

app.add_middleware(CorrelationIdMiddleware)

# Routers
app.include_router(users.router, prefix=settings.API_V1_STR)
app.include_router(lots.router, prefix=settings.API_V1_STR)
app.include_router(friends.router, prefix=settings.API_V1_STR)
app.include_router(park.router, prefix=settings.API_V1_STR)
app.include_router(favorites.router, prefix=settings.API_V1_STR)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
    }


@app.get("/")
async def root():
    return RedirectResponse(url="/docs")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
