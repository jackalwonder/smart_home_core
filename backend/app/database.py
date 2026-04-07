from __future__ import annotations

"""数据库连接、会话工厂与线程池会话辅助函数。"""

import os
from pathlib import Path
from collections.abc import Generator
from typing import Any, Callable, TypeVar

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from fastapi.concurrency import run_in_threadpool


def _default_database_url() -> str:
    db_name = os.getenv("POSTGRES_DB", "smart_home")
    db_user = os.getenv("POSTGRES_USER", "smart_home_user")
    db_password = os.getenv("POSTGRES_PASSWORD", "change_me")
    db_host = os.getenv("POSTGRES_HOST", "localhost")
    db_port = os.getenv("POSTGRES_PORT", "5432")
    return f"postgresql+psycopg://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"


DATABASE_URL = os.getenv("DATABASE_URL", _default_database_url())
DATA_DIR = Path(os.getenv("APP_DATA_DIR", "/app/data")).resolve()
MEDIA_DIR = DATA_DIR / "media"
FLOOR_PLAN_DIR = MEDIA_DIR / "floorplans"


class Base(DeclarativeBase):
    pass


engine = create_engine(DATABASE_URL, echo=False, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

T = TypeVar("T")


def ensure_runtime_schema() -> None:
    FLOOR_PLAN_DIR.mkdir(parents=True, exist_ok=True)

    with engine.begin() as connection:
        connection.exec_driver_sql(
            "ALTER TABLE devices ADD COLUMN IF NOT EXISTS ha_device_id VARCHAR(255)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_devices_ha_device_id ON devices (ha_device_id)"
        )
        connection.exec_driver_sql(
            "ALTER TABLE zones ADD COLUMN IF NOT EXISTS floor_plan_image_path VARCHAR(255)"
        )
        connection.exec_driver_sql(
            "ALTER TABLE zones ADD COLUMN IF NOT EXISTS floor_plan_image_width INTEGER"
        )
        connection.exec_driver_sql(
            "ALTER TABLE zones ADD COLUMN IF NOT EXISTS floor_plan_image_height INTEGER"
        )
        connection.exec_driver_sql(
            "ALTER TABLE zones ADD COLUMN IF NOT EXISTS floor_plan_analysis TEXT"
        )
        connection.exec_driver_sql(
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS plan_x DOUBLE PRECISION"
        )
        connection.exec_driver_sql(
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS plan_y DOUBLE PRECISION"
        )
        connection.exec_driver_sql(
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS plan_width DOUBLE PRECISION"
        )
        connection.exec_driver_sql(
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS plan_height DOUBLE PRECISION"
        )
        connection.exec_driver_sql(
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS plan_rotation DOUBLE PRECISION"
        )
        connection.exec_driver_sql(
            "ALTER TABLE devices ADD COLUMN IF NOT EXISTS plan_x DOUBLE PRECISION"
        )
        connection.exec_driver_sql(
            "ALTER TABLE devices ADD COLUMN IF NOT EXISTS plan_y DOUBLE PRECISION"
        )
        connection.exec_driver_sql(
            "ALTER TABLE devices ADD COLUMN IF NOT EXISTS plan_z DOUBLE PRECISION"
        )
        connection.exec_driver_sql(
            "ALTER TABLE devices ADD COLUMN IF NOT EXISTS plan_rotation DOUBLE PRECISION"
        )


def get_db_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


async def run_in_threadpool_session(func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    def _run() -> T:
        # 线程池任务必须持有自己独立的 Session，避免跨线程复用请求会话。
        session = SessionLocal()
        try:
            return func(session, *args, **kwargs)
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    return await run_in_threadpool(_run)
