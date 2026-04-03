from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from app.auth import READ_SCOPE, require_websocket_scope
from app.services.realtime import device_realtime_hub

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/devices")
async def device_updates(websocket: WebSocket) -> None:
    try:
        await require_websocket_scope(websocket, READ_SCOPE)
    except HTTPException as exc:
        await websocket.close(code=4401 if exc.status_code == 401 else 4403, reason=exc.detail)
        return

    await device_realtime_hub.connect(websocket)
    try:
        while True:
            message = await websocket.receive_text()
            if message.strip().lower() == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        logger.info("Frontend WebSocket client disconnected.")
    except Exception:
        logger.exception("Unexpected error in frontend WebSocket connection.")
    finally:
        await device_realtime_hub.disconnect(websocket)
