"""
Session-wide test fixtures.

The FastAPI lifespan sets app.state.supabase / app.state.admin_supabase during
startup.  When TestClient is created at module level (not used as a context
manager) the lifespan never runs, so we seed app.state here with lightweight
MagicMock clients before any test is executed.
"""

from unittest.mock import MagicMock

import pytest
from app.main import app


@pytest.fixture(autouse=True, scope="session")
def mock_app_state():
    """Populate app.state as if the lifespan startup has run."""
    mock_db = MagicMock()

    # GET /lots/{id}/forecast  →  .table().select().eq().single().execute().data
    mock_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "current_occupancy": 20,
        "capacity": 100,
    }

    # GET /lots (no campus filter)  →  .table().select().range().execute().data
    mock_db.table.return_value.select.return_value.range.return_value.execute.return_value.data = (
        []
    )

    # GET /lots?campus=…  →  .table().select().eq().range().execute().data
    mock_db.table.return_value.select.return_value.eq.return_value.range.return_value.execute.return_value.data = (
        []
    )

    app.state.supabase = mock_db
    app.state.admin_supabase = MagicMock()

    yield

    # Clean up so other test sessions start fresh
    try:
        del app.state.supabase
        del app.state.admin_supabase
    except AttributeError:
        pass
        pass
