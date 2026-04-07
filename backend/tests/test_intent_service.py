from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.services import intent_service


class _FrozenDateTime(datetime):
    current = datetime(2026, 4, 7, 12, 0, 0, tzinfo=timezone.utc)

    @classmethod
    def now(cls, tz=None):
        if tz is None:
            return cls.current.replace(tzinfo=None)
        return cls.current.astimezone(tz)


def test_is_expired_returns_false_within_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(intent_service, "datetime", _FrozenDateTime)
    created_at = _FrozenDateTime.current - timedelta(seconds=30)

    assert intent_service._is_expired(created_at) is False


def test_is_expired_returns_true_after_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(intent_service, "datetime", _FrozenDateTime)
    created_at = _FrozenDateTime.current - timedelta(seconds=61)

    assert intent_service._is_expired(created_at) is True


@pytest.mark.asyncio
async def test_get_and_clear_active_intent_returns_command_within_ttl(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(intent_service, "datetime", _FrozenDateTime)

    pending_intent = SimpleNamespace(
        id=1,
        user_id="user-1",
        original_command="有点热，想看电影",
        is_active=True,
        created_at=_FrozenDateTime.current - timedelta(seconds=20),
    )
    db = MagicMock()
    db.scalar.return_value = pending_intent
    
    async def _run_with_db(func, *args, **kwargs):
        return func(db, *args, **kwargs)

    monkeypatch.setattr(intent_service, "run_in_threadpool_session", _run_with_db)

    result = await intent_service.get_and_clear_active_intent("user-1")

    assert result == "有点热，想看电影"
    assert pending_intent.is_active is False
    db.scalar.assert_called_once()
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_get_and_clear_active_intent_returns_none_when_expired(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(intent_service, "datetime", _FrozenDateTime)

    pending_intent = SimpleNamespace(
        id=2,
        user_id="user-2",
        original_command="打开客厅灯",
        is_active=True,
        created_at=_FrozenDateTime.current - timedelta(seconds=90),
    )
    db = MagicMock()
    db.scalar.return_value = pending_intent

    async def _run_with_db(func, *args, **kwargs):
        return func(db, *args, **kwargs)

    monkeypatch.setattr(intent_service, "run_in_threadpool_session", _run_with_db)

    result = await intent_service.get_and_clear_active_intent("user-2")

    assert result is None
    assert pending_intent.is_active is False
    db.scalar.assert_called_once()
    db.commit.assert_called_once()
