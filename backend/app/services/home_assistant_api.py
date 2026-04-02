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
                "Home Assistant REST API 尚未配置，请设置 HOME_ASSISTANT_REST_URL 和 "
                "HOME_ASSISTANT_ACCESS_TOKEN。"
            )
        return cls(base_url=base_url, access_token=access_token)

    @property
    def websocket_url(self) -> str:
        return _derive_websocket_url_from_rest(self.base_url)

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
                f"Home Assistant 拒绝了服务调用 {service}：{exc.response.status_code} {body}"
            ) from exc
        except httpx.HTTPError as exc:
            logger.exception("Failed to reach Home Assistant REST API for service %s.", service)
            raise ExternalServiceError(f"无法连接到 Home Assistant REST API：{exc}") from exc

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

    async def get_states(self) -> list[dict[str, Any]]:
        url = f"{self.base_url}/states"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            body = exc.response.text
            logger.exception("Home Assistant states request failed with %s.", exc.response.status_code)
            raise ExternalServiceError(
                f"获取 Home Assistant 实体列表失败：{exc.response.status_code} {body}"
            ) from exc
        except httpx.HTTPError as exc:
            logger.exception("Failed to reach Home Assistant REST API for states request.")
            raise ExternalServiceError(f"无法连接到 Home Assistant REST API：{exc}") from exc

        data = response.json()
        if not isinstance(data, list):
            raise ExternalServiceError("Home Assistant /states 返回了非列表数据。")
        return [item for item in data if isinstance(item, dict)]

    @staticmethod
    def _split_service(service: str) -> tuple[str, str]:
        if "." not in service:
            raise ExternalServiceError(f"无效的 Home Assistant 服务名称：{service}")
        domain, service_name = service.split(".", 1)
        if not domain or not service_name:
            raise ExternalServiceError(f"无效的 Home Assistant 服务名称：{service}")
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


def _derive_websocket_url_from_rest(base_url: str) -> str:
    if base_url.startswith("http://"):
        return base_url.replace("http://", "ws://", 1).rstrip("/") + "/websocket"
    if base_url.startswith("https://"):
        return base_url.replace("https://", "wss://", 1).rstrip("/") + "/websocket"
    return ""
