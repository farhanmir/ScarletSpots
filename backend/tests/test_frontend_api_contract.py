"""
Contract checks between backend API routes and mobile client expectations.

These tests intentionally focus on route presence, method availability,
non-404 behavior, and key response shapes that the frontend relies on.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_mobile_expected_paths_exist_in_openapi() -> None:
    """Every endpoint used by mobile should be present in OpenAPI paths."""
    res = client.get("/api/v1/openapi.json")
    assert res.status_code == 200
    spec = res.json()
    paths = set(spec.get("paths", {}).keys())

    expected_paths = {
        "/api/v1/users/signup",
        "/api/v1/users/me",
        "/api/v1/users/password-reset",
        "/api/v1/users/me/location",
        "/api/v1/users/me/export",
        "/api/v1/users/me/push-token",
        "/api/v1/park/session",
        "/api/v1/park/session/active",
        "/api/v1/park/session/end",
        "/api/v1/friends",
        "/api/v1/friends/request",
        "/api/v1/friends/accept",
        "/api/v1/friends/decline",
        "/api/v1/friends/block",
        "/api/v1/friends/unblock",
        "/api/v1/friends/{friendship_id}/sharing",
        "/api/v1/favorites",
        "/api/v1/favorites/{lot_id}",
        "/api/v1/lots/occupancy",
        "/api/v1/lots/{lot_id}/forecast",
    }

    missing = sorted(expected_paths - paths)
    assert not missing, f"Missing API paths required by mobile: {missing}"


def test_mobile_expected_methods_exist_in_openapi() -> None:
    """Each mobile path should expose the HTTP methods used by the app."""
    res = client.get("/api/v1/openapi.json")
    assert res.status_code == 200
    spec = res.json()
    spec_paths = spec.get("paths", {})

    expected_methods = {
        "/api/v1/users/signup": {"post"},
        "/api/v1/users/me": {"get", "patch", "delete"},
        "/api/v1/users/password-reset": {"post"},
        "/api/v1/users/me/location": {"post"},
        "/api/v1/users/me/export": {"get"},
        "/api/v1/users/me/push-token": {"post", "delete"},
        "/api/v1/park/session": {"post"},
        "/api/v1/park/session/active": {"get"},
        "/api/v1/park/session/end": {"post"},
        "/api/v1/friends": {"get"},
        "/api/v1/friends/request": {"post"},
        "/api/v1/friends/accept": {"post"},
        "/api/v1/friends/decline": {"post"},
        "/api/v1/friends/block": {"post"},
        "/api/v1/friends/unblock": {"post"},
        "/api/v1/friends/{friendship_id}/sharing": {"put"},
        "/api/v1/favorites": {"get"},
        "/api/v1/favorites/{lot_id}": {"post", "delete"},
        "/api/v1/lots/occupancy": {"get"},
        "/api/v1/lots/{lot_id}/forecast": {"get"},
    }

    missing_methods: list[str] = []
    for path, methods in expected_methods.items():
        available = set(spec_paths.get(path, {}).keys())
        for method in methods:
            if method not in available:
                missing_methods.append(f"{method.upper()} {path}")

    assert not missing_methods, f"OpenAPI is missing methods required by mobile: {missing_methods}"


def test_auth_required_routes_do_not_404() -> None:
    """Unauthenticated calls should fail with auth/validation errors, not 404."""
    route_calls = [
        ("get", "/api/v1/users/me", None),
        ("patch", "/api/v1/users/me", {"first_name": "Test"}),
        ("post", "/api/v1/users/me/location", {"latitude": 40.5, "longitude": -74.4}),
        ("get", "/api/v1/park/session/active", None),
        ("post", "/api/v1/park/session", {"lotId": "10001"}),
        ("post", "/api/v1/park/session/end", {}),
        ("get", "/api/v1/friends", None),
        ("post", "/api/v1/friends/request", {"friend_email": "a@rutgers.edu"}),
        (
            "post",
            "/api/v1/friends/accept",
            {"request_id": "00000000-0000-0000-0000-000000000000"},
        ),
        (
            "post",
            "/api/v1/friends/decline",
            {"request_id": "00000000-0000-0000-0000-000000000000"},
        ),
        (
            "post",
            "/api/v1/friends/block",
            {"user_id": "00000000-0000-0000-0000-000000000000"},
        ),
        (
            "post",
            "/api/v1/friends/unblock",
            {"user_id": "00000000-0000-0000-0000-000000000000"},
        ),
        (
            "put",
            "/api/v1/friends/00000000-0000-0000-0000-000000000000/sharing",
            {"enabled": True},
        ),
        ("get", "/api/v1/favorites", None),
        ("post", "/api/v1/favorites/10001", None),
        ("delete", "/api/v1/favorites/10001", None),
    ]

    for method, path, payload in route_calls:
        req_fn = getattr(client, method)
        if payload is None:
            resp = req_fn(path)
        else:
            resp = req_fn(path, json=payload)

        assert resp.status_code != 404, f"Unexpected 404 for {method.upper()} {path}"


def test_core_public_response_shapes() -> None:
    """Public endpoints should return JSON shapes consumed by mobile."""
    health = client.get("/health")
    assert health.status_code == 200
    health_data = health.json()
    assert health_data.get("status") == "ok"
    assert "project" in health_data
    assert "version" in health_data

    occupancy = client.get("/api/v1/lots/occupancy")
    assert occupancy.status_code in (200, 401)
    if occupancy.status_code == 200:
        occ_data = occupancy.json()
        assert "occupancy" in occ_data
        assert isinstance(occ_data["occupancy"], (list, dict))

    forecast = client.get(
        "/api/v1/lots/10001/forecast",
        params={"capacity": 200, "current_occupancy": 50},
    )
    assert forecast.status_code in (200, 401)
    if forecast.status_code == 200:
        forecast_data = forecast.json()
        assert "slices" in forecast_data
        assert "curve" in forecast_data

        for key in ["now", "15m", "30m", "60m"]:
            assert key in forecast_data["slices"]
