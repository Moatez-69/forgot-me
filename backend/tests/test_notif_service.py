from datetime import date, timedelta
from unittest.mock import patch

import pytest


@pytest.mark.asyncio
class TestNotifService:
    async def test_init_db_creates_table(self, temp_db):
        import aiosqlite

        async with aiosqlite.connect(temp_db) as db:
            cursor = await db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='events'"
            )
            row = await cursor.fetchone()
            assert row is not None

    async def test_store_and_retrieve_events(self, temp_db):
        with patch("services.notif_service.DB_PATH", temp_db):
            from services.notif_service import get_upcoming_events, store_events

            events = [
                {
                    "title": "Deadline",
                    "date": (date.today() + timedelta(days=3)).isoformat(),
                    "description": "Project due",
                },
                {
                    "title": "Meeting",
                    "date": (date.today() + timedelta(days=1)).isoformat(),
                    "description": "Team sync",
                },
            ]
            count = await store_events(events, "test.pdf", "/path/test.pdf")
            assert count == 2

            upcoming = await get_upcoming_events()
            assert len(upcoming) == 2
            # Should be sorted by date ascending
            assert upcoming[0]["title"] == "Meeting"
            assert upcoming[1]["title"] == "Deadline"

    async def test_store_events_empty_list(self, temp_db):
        with patch("services.notif_service.DB_PATH", temp_db):
            from services.notif_service import store_events

            count = await store_events([], "test.pdf", "/path/test.pdf")
            assert count == 0

    async def test_get_upcoming_excludes_past(self, temp_db):
        with patch("services.notif_service.DB_PATH", temp_db):
            from services.notif_service import get_upcoming_events, store_events

            events = [
                {"title": "Past Event", "date": "2020-01-01", "description": "Old"},
                {
                    "title": "Future Event",
                    "date": (date.today() + timedelta(days=10)).isoformat(),
                    "description": "Coming",
                },
            ]
            await store_events(events, "test.pdf", "/path/test.pdf")
            upcoming = await get_upcoming_events()
            titles = [e["title"] for e in upcoming]
            assert "Past Event" not in titles
            assert "Future Event" in titles

    async def test_null_date_events_included(self, temp_db):
        with patch("services.notif_service.DB_PATH", temp_db):
            from services.notif_service import get_upcoming_events, store_events

            events = [
                {"title": "No Date Event", "date": None, "description": "Undated"},
            ]
            await store_events(events, "test.pdf", "/path/test.pdf")
            upcoming = await get_upcoming_events()
            titles = [e["title"] for e in upcoming]
            assert "No Date Event" in titles

    async def test_get_event_count(self, temp_db):
        with patch("services.notif_service.DB_PATH", temp_db):
            from services.notif_service import get_event_count, store_events

            events = [
                {
                    "title": "E1",
                    "date": (date.today() + timedelta(days=1)).isoformat(),
                    "description": "d",
                },
                {
                    "title": "E2",
                    "date": (date.today() + timedelta(days=2)).isoformat(),
                    "description": "d",
                },
            ]
            await store_events(events, "f", "/f")
            count = await get_event_count()
            assert count == 2

    async def test_check_connection(self, temp_db):
        with patch("services.notif_service.DB_PATH", temp_db):
            from services.notif_service import check_connection

            assert await check_connection() is True

    async def test_events_are_user_scoped(self, temp_db):
        with patch("services.notif_service.DB_PATH", temp_db):
            from services.notif_service import get_upcoming_events, store_events

            await store_events(
                [{"title": "U1 Event", "date": None, "description": "d"}],
                "u1.txt",
                "/u1.txt",
                user_id="u1",
            )
            await store_events(
                [{"title": "U2 Event", "date": None, "description": "d"}],
                "u2.txt",
                "/u2.txt",
                user_id="u2",
            )

            u1_events = await get_upcoming_events(user_id="u1")
            u2_events = await get_upcoming_events(user_id="u2")
            assert [e["title"] for e in u1_events] == ["U1 Event"]
            assert [e["title"] for e in u2_events] == ["U2 Event"]

    async def test_save_webhook_replaces_previous_for_user(self, temp_db):
        with patch("services.notif_service.DB_PATH", temp_db):
            from services.notif_service import get_webhooks, save_webhook

            await save_webhook("https://discord.com/api/webhooks/1/a", user_id="u1")
            await save_webhook("https://discord.com/api/webhooks/2/b", user_id="u1")
            hooks = await get_webhooks(user_id="u1")

            assert len(hooks) == 1
            assert hooks[0]["url"] == "https://discord.com/api/webhooks/2/b"
