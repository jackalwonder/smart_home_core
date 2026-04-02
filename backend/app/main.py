from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import Base, engine
from app.routers.api import router as api_router
from app.routers.management import router as management_router
from app.routers.realtime import router as realtime_router
from app.services.home_assistant_ws import HomeAssistantWebSocketListener
from app.services.realtime import device_realtime_hub


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    device_realtime_hub.attach_loop(asyncio.get_running_loop())
    listener = HomeAssistantWebSocketListener.from_env()
    app.state.ha_listener = listener
    if listener is not None:
        await listener.start()
    yield
    if listener is not None:
        await listener.stop()


app = FastAPI(
    title="Smart Home Core API",
    version="0.1.0",
    lifespan=lifespan,
)
app.include_router(management_router)
app.include_router(api_router)
app.include_router(realtime_router)


@app.get("/health", tags=["system"])
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
