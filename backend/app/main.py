from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from contextlib import suppress

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool

from app import models as _models  # noqa: F401
from app.database import Base, SessionLocal, engine, ensure_runtime_schema
from app.routers import chat
from app.routers.api import router as api_router
from app.routers.management import router as management_router
from app.routers.realtime import router as realtime_router
from app.services import home_assistant_import_service, intent_service
from app.services.errors import ConfigurationError, ExternalServiceError
from app.services.home_assistant_ws import HomeAssistantWebSocketListener
from app.services.realtime import device_realtime_hub

logger = logging.getLogger(__name__)


async def _pending_intent_cleanup_loop(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        session = SessionLocal()
        try:
            await intent_service.cleanup_expired_intents(session)
        except Exception:
            session.rollback()
            logger.exception("Pending intent cleanup loop failed.")
        finally:
            session.close()

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=60)
        except asyncio.TimeoutError:
            continue


@asynccontextmanager
async def lifespan(app: FastAPI):
    await run_in_threadpool(Base.metadata.create_all, bind=engine)
    await run_in_threadpool(ensure_runtime_schema)

    cleanup_stop_event = asyncio.Event()
    cleanup_task = asyncio.create_task(_pending_intent_cleanup_loop(cleanup_stop_event))

    session = SessionLocal()
    try:
        await home_assistant_import_service.import_home_assistant_entities(session)
    except ConfigurationError:
        session.rollback()
        logger.info("Skipped Home Assistant entity import at startup because integration is not configured.")
    except ExternalServiceError:
        session.rollback()
        logger.exception("Home Assistant entity import failed during startup.")
    except Exception:
        session.rollback()
        logger.exception("Unexpected error during Home Assistant entity import at startup.")
    finally:
        session.close()

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
app.include_router(management_router)
app.include_router(api_router)
app.include_router(realtime_router)
app.include_router(chat.router, prefix="/api/chat", tags=["Voice Chat"])


@app.get("/health", tags=["系统"])
def healthcheck() -> dict[str, str]:
    return {"status": "正常"}
