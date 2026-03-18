"""
Session-wide test fixtures.

The FastAPI lifespan sets app.state.admin_auth during startup.
When TestClient is created at module level (not used as a context
manager) the lifespan never runs, so we seed app.state here with
lightweight MagicMock clients before any test is executed.
"""

from unittest.mock import MagicMock

import pytest
from app.main import app
from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend


@pytest.fixture(autouse=True, scope="session")
def mock_app_state():
    """Populate app.state as if the lifespan startup has run."""
    # Use in-memory backend so tests don't need a live Redis
    FastAPICache.init(InMemoryBackend(), prefix="test:")

    app.state.admin_auth = MagicMock()

    yield

    # Clean up so other test sessions start fresh
    try:
        del app.state.admin_auth
    except AttributeError:
        pass
