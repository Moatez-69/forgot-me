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
