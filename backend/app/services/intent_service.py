from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.concurrency import run_in_threadpool
from loguru import logger
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PendingIntent

INTENT_TTL_SECONDS = 60


async def save_pending_intent(db: Session, user_id: str, command: str) -> PendingIntent:
    logger.info("Saving pending intent for user_id={} command={}", user_id, command)

    def _save() -> PendingIntent:
        pending_intent = PendingIntent(
            user_id=user_id.strip(),
            original_command=command.strip(),
            is_active=True,
        )
        db.add(pending_intent)
        db.commit()
        db.refresh(pending_intent)
        return pending_intent

    return await run_in_threadpool(_save)


async def get_and_clear_active_intent(db: Session, user_id: str) -> str | None:
    normalized_user_id = user_id.strip()

    def _get_and_clear() -> str | None:
        pending_intent = db.scalar(
            select(PendingIntent)
            .where(PendingIntent.user_id == normalized_user_id, PendingIntent.is_active.is_(True))
            .order_by(PendingIntent.created_at.desc(), PendingIntent.id.desc())
            .limit(1)
        )

        if pending_intent is None:
            logger.info("No active pending intent found for user_id={}", normalized_user_id)
            return None

        if _is_expired(pending_intent.created_at):
            logger.info(
                "Pending intent {} for user_id={} has expired and will be cleared.",
                pending_intent.id,
                normalized_user_id,
            )
            pending_intent.is_active = False
            db.commit()
            return None

        logger.info("Consuming active pending intent {} for user_id={}", pending_intent.id, normalized_user_id)
        pending_intent.is_active = False
        db.commit()
        return pending_intent.original_command

    return await run_in_threadpool(_get_and_clear)


async def cleanup_expired_intents(db: Session) -> int:
    def _cleanup() -> int:
        active_intents = list(
            db.scalars(
                select(PendingIntent).where(PendingIntent.is_active.is_(True))
            ).all()
        )

        expired_count = 0
        for pending_intent in active_intents:
            if not _is_expired(pending_intent.created_at):
                continue
            pending_intent.is_active = False
            expired_count += 1

        if expired_count == 0:
            logger.info("No expired pending intents found during cleanup.")
            return 0

        db.commit()
        logger.info("Marked {} expired pending intents as inactive.", expired_count)
        return expired_count

    return await run_in_threadpool(_cleanup)


def _is_expired(created_at: datetime) -> bool:
    created_at_utc = created_at.replace(tzinfo=timezone.utc) if created_at.tzinfo is None else created_at.astimezone(timezone.utc)
    expires_at = created_at_utc + timedelta(seconds=INTENT_TTL_SECONDS)
    return datetime.now(timezone.utc) > expires_at
