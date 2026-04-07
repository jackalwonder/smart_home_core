from __future__ import annotations

from enum import Enum
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Enum as SqlEnum, Float, Integer
from sqlalchemy import ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DeviceType(str, Enum):
    MIJIA_LIGHT = "mijia_light"
    NAS = "nas"
    WINDOWS_PC = "windows_pc"
    SENSOR = "sensor"
    CLIMATE = "climate"
    CAMERA = "camera"
    SWITCH = "switch"


class DeviceStatus(str, Enum):
    UNKNOWN = "unknown"
    ONLINE = "online"
    OFFLINE = "offline"
    ON = "on"
    OFF = "off"
    SLEEPING = "sleeping"
    UNAVAILABLE = "unavailable"


class Zone(Base):
    __tablename__ = "zones"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    floor_plan_image_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    floor_plan_image_width: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    floor_plan_image_height: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    floor_plan_analysis: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)

    rooms: Mapped[list["Room"]] = relationship(
        back_populates="zone",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Room(Base):
    __tablename__ = "rooms"
    __table_args__ = (UniqueConstraint("zone_id", "name", name="uq_room_name_per_zone"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    description: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    zone_id: Mapped[int] = mapped_column(ForeignKey("zones.id", ondelete="CASCADE"), index=True)
    plan_x: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    plan_y: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    plan_width: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    plan_height: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    plan_rotation: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)

    zone: Mapped["Zone"] = relationship(back_populates="rooms")
    devices: Mapped[list["Device"]] = relationship(
        back_populates="room",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    ha_entity_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    ha_device_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    device_type: Mapped[DeviceType] = mapped_column(
        SqlEnum(DeviceType, name="device_type_enum"),
        index=True,
    )
    current_status: Mapped[DeviceStatus] = mapped_column(
        SqlEnum(DeviceStatus, name="device_status_enum"),
        default=DeviceStatus.UNKNOWN,
    )
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    plan_x: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    plan_y: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    plan_z: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    plan_rotation: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)

    room: Mapped["Room"] = relationship(back_populates="devices")


class PendingIntent(Base):
    __tablename__ = "pending_intents"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(String(255), index=True)
    original_command: Mapped[str] = mapped_column(Text())
    is_active: Mapped[bool] = mapped_column(Boolean(), default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=func.now())
