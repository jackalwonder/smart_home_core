from __future__ import annotations

import hashlib
import hmac
import os
import time
from dataclasses import dataclass
from typing import Annotated

from fastapi import Header, HTTPException, Request, WebSocket, status


READ_SCOPE = "read"
CONTROL_SCOPE = "control"
ADMIN_SCOPE = "admin"


@dataclass(frozen=True, slots=True)
class AuthContext:
    source: str
    scopes: frozenset[str]


def _configured_tokens() -> list[tuple[str, str, frozenset[str]]]:
    tokens: list[tuple[str, str, frozenset[str]]] = []

    def add(env_name: str, scopes: tuple[str, ...]) -> None:
        token = os.getenv(env_name, "").strip()
        if token:
            tokens.append((env_name, token, frozenset(scopes)))

    add("APP_READ_API_KEY", (READ_SCOPE,))
    add("APP_CONTROL_API_KEY", (READ_SCOPE, CONTROL_SCOPE))
    add("APP_ADMIN_API_KEY", (READ_SCOPE, CONTROL_SCOPE, ADMIN_SCOPE))
    add("APP_API_KEY", (READ_SCOPE, CONTROL_SCOPE, ADMIN_SCOPE))
    return tokens


def _extract_bearer_token(authorization: str | None) -> str | None:
    if authorization is None:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token.strip()


def _resolve_context(token: str | None) -> AuthContext:
    configured_tokens = _configured_tokens()
    if not configured_tokens:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="服务端尚未配置 API 访问密钥。",
        )

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="缺少访问凭证。",
            headers={"WWW-Authenticate": "Bearer"},
        )

    matched_sources: list[str] = []
    matched_scopes: set[str] = set()
    for env_name, expected_token, scopes in configured_tokens:
        if hmac.compare_digest(token, expected_token):
            matched_sources.append(env_name)
            matched_scopes.update(scopes)

    if matched_sources:
        return AuthContext(source=",".join(matched_sources), scopes=frozenset(matched_scopes))

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="访问凭证无效。",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_scope(scope: str):
    async def dependency(
        authorization: Annotated[str | None, Header()] = None,
        x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
    ) -> AuthContext:
        token = x_api_key or _extract_bearer_token(authorization)
        context = _resolve_context(token)
        if scope not in context.scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="当前凭证没有访问该接口的权限。",
            )
        return context

    return dependency


async def require_websocket_scope(
    websocket: WebSocket,
    scope: str,
) -> AuthContext:
    header_token = websocket.headers.get("x-api-key") or _extract_bearer_token(websocket.headers.get("authorization"))
    query_token = websocket.query_params.get("api_key") or websocket.query_params.get("token")
    context = _resolve_context(query_token or header_token)
    if scope not in context.scopes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="当前凭证没有访问该 WebSocket 的权限。",
        )
    return context


async def verify_webhook_request(
    request: Request,
    x_smart_home_timestamp: Annotated[str | None, Header(alias="X-Smart-Home-Timestamp")] = None,
    x_smart_home_signature: Annotated[str | None, Header(alias="X-Smart-Home-Signature")] = None,
) -> None:
    secret = os.getenv("APP_WEBHOOK_SECRET", "").strip()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="服务端尚未配置 Webhook 签名密钥。",
        )

    if not x_smart_home_timestamp or not x_smart_home_signature:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="缺少 Webhook 签名头。",
        )

    try:
        timestamp = int(x_smart_home_timestamp)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Webhook 时间戳格式无效。",
        ) from exc

    max_skew = int(os.getenv("APP_WEBHOOK_MAX_SKEW_SECONDS", "300"))
    if abs(int(time.time()) - timestamp) > max_skew:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Webhook 请求已过期或时间偏差过大。",
        )

    provided_signature = x_smart_home_signature.strip()
    if "=" in provided_signature:
        algorithm, _, signature_value = provided_signature.partition("=")
        if algorithm.lower() != "sha256":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Webhook 签名算法不受支持。",
            )
        provided_signature = signature_value

    body = await request.body()
    signed_payload = f"{timestamp}.".encode("utf-8") + body
    expected_signature = hmac.new(
        secret.encode("utf-8"),
        signed_payload,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(provided_signature, expected_signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Webhook 签名校验失败。",
        )
