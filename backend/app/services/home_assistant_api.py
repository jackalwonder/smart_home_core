from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from app.services.errors import ConfigurationError, ExternalServiceError

logger = logging.getLogger(__name__)


class HomeAssistantRestClient:
    def __init__(self, base_url: str, access_token: str, timeout: float = 15.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.access_token = access_token
        self.timeout = timeout

    @classmethod
    def from_env(cls) -> "HomeAssistantRestClient":
        base_url = os.getenv("HOME_ASSISTANT_REST_URL", "").strip() or _derive_rest_url_from_websocket()
        access_token = os.getenv("HOME_ASSISTANT_ACCESS_TOKEN", "").strip()
        if not base_url or not access_token:
            raise ConfigurationError(
                "Home Assistant REST API is not configured. Set HOME_ASSISTANT_REST_URL and "
                "HOME_ASSISTANT_ACCESS_TOKEN."
            )
        return cls(base_url=base_url, access_token=access_token)

    async def call_service(
        self,
        service: str,
        entity_id: str | list[str] | None = None,
        service_data: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        domain, service_name = self._split_service(service)
        payload = dict(service_data or {})
        if entity_id is not None:
            payload["entity_id"] = entity_id

        url = f"{self.base_url}/services/{domain}/{service_name}"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

        logger.info("Calling Home Assistant service %s for entity %s.", service, entity_id)
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            body = exc.response.text
            logger.exception("Home Assistant service %s failed with %s.", service, exc.response.status_code)
            raise ExternalServiceError(
                f"Home Assistant rejected service call {service}: {exc.response.status_code} {body}"
            ) from exc
        except httpx.HTTPError as exc:
            logger.exception("Failed to reach Home Assistant REST API for service %s.", service)
            raise ExternalServiceError(f"Failed to reach Home Assistant REST API: {exc}") from exc

        if not response.content:
            return []

        try:
            data = response.json()
        except ValueError:
            logger.warning("Home Assistant service %s returned a non-JSON body.", service)
            return []
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]
        if isinstance(data, dict):
            return [data]
        return []

    @staticmethod
    def _split_service(service: str) -> tuple[str, str]:
        if "." not in service:
            raise ExternalServiceError(f"Invalid Home Assistant service name: {service}")
        domain, service_name = service.split(".", 1)
        if not domain or not service_name:
            raise ExternalServiceError(f"Invalid Home Assistant service name: {service}")
        return domain, service_name


def _derive_rest_url_from_websocket() -> str:
    websocket_url = os.getenv("HOME_ASSISTANT_WS_URL", "").strip()
    if not websocket_url:
        return ""
    if websocket_url.startswith("ws://"):
        return websocket_url.replace("ws://", "http://", 1).removesuffix("/websocket")
    if websocket_url.startswith("wss://"):
        return websocket_url.replace("wss://", "https://", 1).removesuffix("/websocket")
    return ""
