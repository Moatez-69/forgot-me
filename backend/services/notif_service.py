import logging
import os
from datetime import date, datetime

import aiosqlite

logger = logging.getLogger(__name__)

DB_PATH = os.getenv("SQLITE_PATH", "./mindvault.db")

INIT_SQL = """
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    date TEXT,
    description TEXT NOT NULL,
    source_file TEXT NOT NULL,
    source_path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


async def init_db() -> None:
    """Create the events table if it doesn't exist."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(INIT_SQL)
        await db.commit()


async def store_events(
    events: list[dict],
    source_file: str,
    source_path: str,
) -> int:
    """
    Insert extracted events into SQLite.
    Returns the number of events stored.
    """
    if not events:
        return 0

    async with aiosqlite.connect(DB_PATH) as db:
        count = 0
        for event in events:
            await db.execute(
                "INSERT INTO events (title, date, description, source_file, source_path) VALUES (?, ?, ?, ?, ?)",
                (
                    event.get("title", "Untitled Event"),
                    event.get("date"),
                    event.get("description", ""),
                    source_file,
                    source_path,
                ),
            )
            count += 1
        await db.commit()
        return count


async def get_upcoming_events() -> list[dict]:
    """
    Fetch events where date >= today.
    Events without a parseable date are included (they might still be relevant).
    """
    today = date.today().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """
            SELECT id, title, date, description, source_file, source_path, created_at
            FROM events
            WHERE date IS NULL OR date >= ?
            ORDER BY
                CASE WHEN date IS NULL THEN 1 ELSE 0 END,
                date ASC
            """,
            (today,),
        )
        rows = await cursor.fetchall()
        return [
            {
                "id": row[0],
                "title": row[1],
                "date": row[2],
                "description": row[3],
                "source_file": row[4],
                "source_path": row[5],
                "created_at": row[6],
            }
            for row in rows
        ]


async def get_event_count() -> int:
    """Count upcoming events for badge display."""
    today = date.today().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT COUNT(*) FROM events WHERE date IS NULL OR date >= ?",
            (today,),
        )
        row = await cursor.fetchone()
        return row[0] if row else 0


async def check_connection() -> bool:
    """Health check — verify SQLite is accessible."""
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("SELECT 1")
            return True
    except Exception:
        return False
