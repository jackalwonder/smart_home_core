from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.auth import (
    AuthContext,
    CONTROL_SCOPE,
    clear_control_session,
    issue_control_session,
    require_scope,
    _resolve_token_context,
)
from app.schemas import ControlSessionRead, ControlSessionRequest

router = APIRouter(prefix="/api/auth", tags=["认证会话"])


@router.post("/control-session", response_model=ControlSessionRead)
async def create_control_session(payload: ControlSessionRequest, response: Response) -> ControlSessionRead:
    context = _resolve_token_context(payload.api_key)
    if context is None or CONTROL_SCOPE not in context.scopes:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="控制口令无效。",
        )

    issue_control_session(response, context)
    return ControlSessionRead(source=context.source, scopes=sorted(context.scopes))


@router.get("/session", response_model=ControlSessionRead)
async def read_control_session(context: AuthContext = Depends(require_scope(CONTROL_SCOPE))) -> ControlSessionRead:
    return ControlSessionRead(source=context.source, scopes=sorted(context.scopes))


@router.delete("/control-session", status_code=status.HTTP_204_NO_CONTENT)
async def delete_control_session(response: Response) -> Response:
    clear_control_session(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
