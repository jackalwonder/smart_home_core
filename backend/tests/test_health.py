from __future__ import annotations

from collections.abc import Generator

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.database import get_db_session
from app.routers.health import router as health_router


class _HealthySession:
    def execute(self, statement) -> int:
        assert str(statement) == "SELECT 1"
        return 1


class _FailingSession:
    def execute(self, statement) -> int:
        raise RuntimeError("database unavailable")


def _build_test_app(session: object) -> FastAPI:
    app = FastAPI()
    app.include_router(health_router, prefix="/api/health", tags=["Health"])

    def _override_db() -> Generator[object, None, None]:
        yield session

    app.dependency_overrides[get_db_session] = _override_db
    return app


def test_healthcheck_returns_connected_status_without_auth() -> None:
    client = TestClient(_build_test_app(_HealthySession()))

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "database": "connected"}


def test_healthcheck_returns_503_when_database_ping_fails() -> None:
    client = TestClient(_build_test_app(_FailingSession()))

    response = client.get("/api/health")

    assert response.status_code == 503
    assert response.json() == {"status": "unhealthy", "database": "disconnected"}
