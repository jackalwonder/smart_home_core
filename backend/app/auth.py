from __future__ import annotations

"""HTTP and WebSocket auth helpers."""

import hashlib
import hmac
import json
import os
import time
from base64 import urlsafe_b64decode, urlsafe_b64encode
from dataclasses import dataclass
from typing import Annotated

from fastapi import Header, HTTPException, Request, Response, WebSocket, status

READ_SCOPE = "read"
CONTROL_SCOPE = "control"
ADMIN_SCOPE = "admin"
CONTROL_SESSION_COOKIE = "smart_home_control"
CONTROL_SESSION_MAX_AGE = 60 * 60 * 12


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


def _cookie_secret() -> str:
    configured_secret = os.getenv("APP_AUTH_COOKIE_SECRET", "").strip()
    if configured_secret:
        return configured_secret

    configured_tokens = _configured_tokens()
    if not configured_tokens:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server API keys are not configured.",
        )

    seed = "|".join(sorted(token for _, token, _ in configured_tokens))
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()


def _encode_cookie_payload(payload: dict[str, object]) -> str:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _decode_cookie_payload(payload: str) -> dict[str, object] | None:
    try:
        padded = payload + "=" * (-len(payload) % 4)
        decoded = urlsafe_b64decode(padded.encode("utf-8"))
        data = json.loads(decoded.decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _extract_bearer_token(authorization: str | None) -> str | None:
    if authorization is None:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token.strip()


def _resolve_token_context(token: str | None) -> AuthContext | None:
    configured_tokens = _configured_tokens()
    if not configured_tokens:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server API keys are not configured.",
        )

    if not token:
        return None

    matched_sources: list[str] = []
    matched_scopes: set[str] = set()
    for env_name, expected_token, scopes in configured_tokens:
        if hmac.compare_digest(token, expected_token):
            matched_sources.append(env_name)
            matched_scopes.update(scopes)

    if not matched_sources:
        return None
    return AuthContext(source=",".join(matched_sources), scopes=frozenset(matched_scopes))


def _resolve_cookie_context(cookie_value: str | None) -> AuthContext | None:
    if not cookie_value:
        return None

    payload_part, separator, signature_part = cookie_value.partition(".")
    if not separator or not payload_part or not signature_part:
        return None

    expected_signature = hmac.new(
        _cookie_secret().encode("utf-8"),
        payload_part.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature_part, expected_signature):
        return None

    payload = _decode_cookie_payload(payload_part)
    if payload is None:
        return None

    expires_at = int(payload.get("exp") or 0)
    if expires_at <= int(time.time()):
        return None

    scopes = payload.get("scopes")
    if not isinstance(scopes, list):
        return None

    normalized_scopes = frozenset(str(scope) for scope in scopes if str(scope).strip())
    if not normalized_scopes:
        return None
    return AuthContext(source=CONTROL_SESSION_COOKIE, scopes=normalized_scopes)


def _resolve_context(tokens: list[str], cookie_value: str | None = None) -> AuthContext:
    matched_sources: list[str] = []
    matched_scopes: set[str] = set()
    invalid_credentials_present = False

    for token in tokens:
        token_context = _resolve_token_context(token)
        if token_context is None:
            if token:
                invalid_credentials_present = True
            continue
        matched_sources.append(token_context.source)
        matched_scopes.update(token_context.scopes)

    cookie_context = _resolve_cookie_context(cookie_value)
    if cookie_value and cookie_context is None:
        invalid_credentials_present = True
    if cookie_context is not None:
        matched_sources.append(cookie_context.source)
        matched_scopes.update(cookie_context.scopes)

    if matched_sources:
        return AuthContext(source=",".join(matched_sources), scopes=frozenset(matched_scopes))

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials." if invalid_credentials_present else "Missing credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def issue_control_session(response: Response, context: AuthContext, max_age: int = CONTROL_SESSION_MAX_AGE) -> None:
    expires_at = int(time.time()) + max_age
    payload_part = _encode_cookie_payload(
        {
            "exp": expires_at,
            "scopes": sorted(context.scopes),
        }
    )
    signature = hmac.new(
        _cookie_secret().encode("utf-8"),
        payload_part.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    response.set_cookie(
        key=CONTROL_SESSION_COOKIE,
        value=f"{payload_part}.{signature}",
        max_age=max_age,
        httponly=True,
        secure=False,
        samesite="lax",
        path="/",
    )


def clear_control_session(response: Response) -> None:
    response.delete_cookie(CONTROL_SESSION_COOKIE, path="/")


def require_scope(scope: str):
    async def dependency(
        request: Request,
        authorization: Annotated[str | None, Header()] = None,
        x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
    ) -> AuthContext:
        context = _resolve_context(
            [x_api_key or "", _extract_bearer_token(authorization) or ""],
            request.cookies.get(CONTROL_SESSION_COOKIE),
        )
        if scope not in context.scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Current credentials do not have permission for this endpoint.",
            )
        return context

    return dependency


async def require_websocket_scope(
    websocket: WebSocket,
    scope: str,
) -> AuthContext:
    header_token = websocket.headers.get("x-api-key") or _extract_bearer_token(websocket.headers.get("authorization"))
    query_token = websocket.query_params.get("api_key") or websocket.query_params.get("token")
    context = _resolve_context(
        [query_token or "", header_token or ""],
        websocket.cookies.get(CONTROL_SESSION_COOKIE),
    )
    if scope not in context.scopes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Current credentials do not have permission for this WebSocket.",
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
            detail="Webhook signing secret is not configured.",
        )

    if not x_smart_home_timestamp or not x_smart_home_signature:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing webhook signature headers.",
        )

    try:
        timestamp = int(x_smart_home_timestamp)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Webhook timestamp is invalid.",
        ) from exc

    max_skew = int(os.getenv("APP_WEBHOOK_MAX_SKEW_SECONDS", "300"))
    if abs(int(time.time()) - timestamp) > max_skew:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Webhook request has expired.",
        )

    provided_signature = x_smart_home_signature.strip()
    if "=" in provided_signature:
        algorithm, _, signature_value = provided_signature.partition("=")
        if algorithm.lower() != "sha256":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unsupported webhook signature algorithm.",
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
            detail="Webhook signature verification failed.",
        )
