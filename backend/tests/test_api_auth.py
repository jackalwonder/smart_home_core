from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi import FastAPI, WebSocketDisconnect
from fastapi.testclient import TestClient

from app.auth import CONTROL_SESSION_COOKIE
from app.database import get_db_session
from app.routers.auth_session import router as auth_session_router
from app.routers.api import router as api_router
from app.routers.realtime import router as realtime_router
from app.schemas import DeviceControlAction, DeviceControlKind, DeviceControlResponse
from app.services import automation_service


def _build_test_app() -> FastAPI:
    app = FastAPI()
    app.include_router(auth_session_router)
    app.include_router(api_router)
    app.include_router(realtime_router)

    def _override_db() -> Generator[object, None, None]:
        yield object()

    app.dependency_overrides[get_db_session] = _override_db
    return app


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("APP_READ_API_KEY", "read-token")
    monkeypatch.setenv("APP_CONTROL_API_KEY", "control-token")
    monkeypatch.delenv("APP_ADMIN_API_KEY", raising=False)
    monkeypatch.delenv("APP_API_KEY", raising=False)
    return TestClient(_build_test_app())


def test_control_device_route_requires_credentials(client: TestClient) -> None:
    response = client.post(
        "/api/device/control",
        json={"device_id": 1, "control_kind": "toggle", "action": "toggle"},
    )

    assert response.status_code == 401
    assert response.json()["detail"]


def test_control_device_route_rejects_read_only_key(client: TestClient) -> None:
    response = client.post(
        "/api/device/control",
        headers={"X-API-Key": "read-token"},
        json={"device_id": 1, "control_kind": "toggle", "action": "toggle"},
    )

    assert response.status_code == 403
    assert response.json()["detail"]


def test_control_device_route_accepts_proxy_header(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_control_device(db, payload):
        assert payload.device_id == 7
        return DeviceControlResponse(
            device_id=7,
            ha_entity_id="switch.desk_fan",
            control_kind=DeviceControlKind.TOGGLE,
            action=DeviceControlAction.TOGGLE,
            forwarded_service="homeassistant.toggle",
            accepted=True,
            result_count=1,
        )

    monkeypatch.setattr(automation_service, "control_device", _fake_control_device)

    response = client.post(
        "/api/device/control",
        headers={"X-API-Key": "control-token"},
        json={"device_id": 7, "control_kind": "toggle", "action": "toggle"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "device_id": 7,
        "ha_entity_id": "switch.desk_fan",
        "control_kind": "toggle",
        "action": "toggle",
        "value": None,
        "option": None,
        "forwarded_service": "homeassistant.toggle",
        "accepted": True,
        "result_count": 1,
    }


def test_websocket_accepts_proxy_header_and_replies_to_ping(client: TestClient) -> None:
    with client.websocket_connect("/ws/devices", headers={"x-api-key": "control-token"}) as websocket:
        assert websocket.receive_json() == {"type": "connection_established"}
        websocket.send_text("ping")
        assert websocket.receive_json() == {"type": "pong"}


def test_websocket_rejects_missing_proxy_header(client: TestClient) -> None:
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws/devices"):
            pass

    assert exc_info.value.code == 4401


def test_control_session_can_upgrade_read_only_proxy_traffic(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_control_device(db, payload):
        return DeviceControlResponse(
            device_id=payload.device_id,
            ha_entity_id="switch.desk_fan",
            control_kind=payload.control_kind,
            action=payload.action,
            forwarded_service="homeassistant.toggle",
            accepted=True,
            result_count=1,
        )

    monkeypatch.setattr(automation_service, "control_device", _fake_control_device)

    create_session = client.post(
        "/api/auth/control-session",
        headers={"X-API-Key": "read-token"},
        json={"api_key": "control-token"},
    )

    assert create_session.status_code == 200
    assert CONTROL_SESSION_COOKIE in create_session.cookies

    response = client.post(
        "/api/device/control",
        headers={"X-API-Key": "read-token"},
        cookies={CONTROL_SESSION_COOKIE: create_session.cookies[CONTROL_SESSION_COOKIE]},
        json={"device_id": 7, "control_kind": "toggle", "action": "toggle"},
    )

    assert response.status_code == 200
    assert response.json()["accepted"] is True


def test_control_session_rejects_read_only_token_submission(client: TestClient) -> None:
    response = client.post(
        "/api/auth/control-session",
        headers={"X-API-Key": "read-token"},
        json={"api_key": "read-token"},
    )

    assert response.status_code == 401
