from __future__ import annotations

"""FastAPI 应用入口，负责启动期初始化与后台守护任务。"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from contextlib import suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import models as _models  # noqa: F401
from app.database import MEDIA_DIR
from app.middleware import RequestIDMiddleware, general_exception_handler, smart_home_exception_handler
from app.routers import chat
from app.routers.auth_session import router as auth_session_router
from app.routers.api import router as api_router
from app.routers.health import router as health_router
from app.routers.management import router as management_router
from app.routers.realtime import router as realtime_router
from app.routers.spatial import router as spatial_router
from app.services import home_assistant_import_service, intent_service
from app.services.exceptions import ServiceConfigurationError, ExternalServiceUnavailableError
from app.services.home_assistant_ws import HomeAssistantWebSocketListener
from app.services.realtime import device_realtime_hub

logger = logging.getLogger(__name__)


def _allowed_origins_from_env() -> list[str]:
    configured_origins = os.getenv("ALLOWED_ORIGINS", "").strip()
    if not configured_origins:
        return ["http://localhost"]

    origins = [origin.strip() for origin in configured_origins.split(",") if origin.strip()]
    return origins or ["http://localhost"]


async def _pending_intent_cleanup_loop(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            # 持续清理短期意图表，避免过期补充指令长期堆积。
            await intent_service.cleanup_expired_intents()
        except Exception:
            logger.exception("Pending intent cleanup loop failed.")

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=60)
        except asyncio.TimeoutError:
            continue


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时先确保表结构和运行期补充字段齐备，再启动同步任务。
    # TODO: Schema 变更已移交 Alembic 管理，禁止在运行时自动建表以防止多实例启动锁竞争。

    cleanup_stop_event = asyncio.Event()
    cleanup_task = asyncio.create_task(_pending_intent_cleanup_loop(cleanup_stop_event))

    try:
        await home_assistant_import_service.import_home_assistant_entities()
    except ServiceConfigurationError:
        logger.info("Skipped Home Assistant entity import at startup because integration is not configured.")
    except ExternalServiceUnavailableError:
        logger.exception("Home Assistant entity import failed during startup.")
    except Exception:
        logger.exception("Unexpected error during Home Assistant entity import at startup.")

    device_realtime_hub.attach_loop(asyncio.get_running_loop())
    listener = HomeAssistantWebSocketListener.from_env()
    app.state.ha_listener = listener
    app.state.pending_intent_cleanup_task = cleanup_task
    if listener is not None:
        await listener.start()
    try:
        yield
    finally:
        cleanup_stop_event.set()
        cleanup_task.cancel()
        with suppress(asyncio.CancelledError):
            await cleanup_task
        if listener is not None:
            await listener.stop()


app = FastAPI(
    title="智能家居管理系统 API",
    version="0.1.0",
    lifespan=lifespan,
)

# 添加中间件和异常处理器
from app.services.exceptions import SmartHomeException

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins_from_env(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key"],
)
app.add_middleware(RequestIDMiddleware)
app.add_exception_handler(SmartHomeException, smart_home_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)

app.include_router(management_router)
app.include_router(auth_session_router)
app.include_router(health_router, prefix="/api/health", tags=["Health"])
app.include_router(api_router)
app.include_router(realtime_router)
app.include_router(spatial_router)
app.include_router(chat.router, prefix="/api/chat", tags=["Voice Chat"])
app.mount("/media", StaticFiles(directory=str(MEDIA_DIR), check_dir=False), name="media")


@app.get("/health", tags=["系统"])
def healthcheck() -> dict[str, str]:
    return {"status": "正常"}
