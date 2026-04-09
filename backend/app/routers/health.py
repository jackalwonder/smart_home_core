from __future__ import annotations

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from loguru import logger
from sqlalchemy import text

from app.dependencies import DbSession

router = APIRouter()


@router.get("")
def healthcheck(db: DbSession) -> JSONResponse:
    try:
        db.execute(text("SELECT 1"))
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"status": "healthy", "database": "connected"},
        )
    except Exception:
        logger.exception("Database healthcheck failed.")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "unhealthy", "database": "disconnected"},
        )
