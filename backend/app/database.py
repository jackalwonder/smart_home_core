from __future__ import annotations

import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


def _default_database_url() -> str:
    db_name = os.getenv("POSTGRES_DB", "smart_home")
    db_user = os.getenv("POSTGRES_USER", "smart_home_user")
    db_password = os.getenv("POSTGRES_PASSWORD", "change_me")
    db_host = os.getenv("POSTGRES_HOST", "localhost")
    db_port = os.getenv("POSTGRES_PORT", "5432")
    return f"postgresql+psycopg://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"


DATABASE_URL = os.getenv("DATABASE_URL", _default_database_url())


class Base(DeclarativeBase):
    pass


engine = create_engine(DATABASE_URL, echo=False, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def ensure_runtime_schema() -> None:
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "ALTER TABLE devices ADD COLUMN IF NOT EXISTS ha_device_id VARCHAR(255)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_devices_ha_device_id ON devices (ha_device_id)"
        )


def get_db_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
