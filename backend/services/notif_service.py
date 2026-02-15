import logging
import os
from datetime import date, datetime, timedelta

import aiosqlite
import httpx

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

INIT_WEBHOOKS_SQL = """
CREATE TABLE IF NOT EXISTS webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT 'Discord',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


async def init_db() -> None:
    """Create the events and webhooks tables if they don't exist."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(INIT_SQL)
        await db.execute(INIT_WEBHOOKS_SQL)
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
            title = event.get("title", "Untitled Event")
            event_date = event.get("date")
            # Dedup: skip if event with same title+date+source_file already exists
            cursor = await db.execute(
                "SELECT COUNT(*) FROM events WHERE title = ? AND date IS ? AND source_file = ?",
                (title, event_date, source_file),
            )
            row = await cursor.fetchone()
            if row and row[0] > 0:
                continue
            await db.execute(
                "INSERT INTO events (title, date, description, source_file, source_path) VALUES (?, ?, ?, ?, ?)",
                (
                    title,
                    event_date,
                    event.get("description", ""),
                    source_file,
                    source_path,
                ),
            )
            count += 1
        await db.commit()

        # Trigger webhooks for newly inserted events with dates within the next 24h
        try:
            now = datetime.now()
            tomorrow = now + timedelta(hours=24)
            for event in events:
                title = event.get("title", "Untitled Event")
                event_date = event.get("date")
                description = event.get("description", "")
                if event_date:
                    try:
                        parsed = datetime.fromisoformat(event_date)
                        if now <= parsed <= tomorrow:
                            await trigger_webhooks(title, description, event_date)
                    except (ValueError, TypeError):
                        pass
        except Exception:
            logger.exception("Failed to trigger webhooks after storing events")

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


async def delete_event(event_id: int) -> bool:
    """Delete a single event by ID."""
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute("DELETE FROM events WHERE id = ?", (event_id,))
            await db.commit()
            return cursor.rowcount > 0
    except Exception:
        return False


async def delete_events_by_source(source_path: str) -> int:
    """Delete all events from a specific source file. Used for cascade delete."""
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute(
                "DELETE FROM events WHERE source_path = ?", (source_path,)
            )
            await db.commit()
            return cursor.rowcount
    except Exception:
        return 0


async def delete_past_events() -> int:
    """Delete events with dates in the past."""
    today = date.today().isoformat()
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute(
                "DELETE FROM events WHERE date IS NOT NULL AND date < ?",
                (today,),
            )
            await db.commit()
            return cursor.rowcount
    except Exception:
        return 0


# --- Webhook functions ---


async def save_webhook(url: str, label: str = "Discord") -> int:
    """Insert a new webhook and return the new row id."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "INSERT INTO webhooks (url, label) VALUES (?, ?)",
            (url, label),
        )
        await db.commit()
        return cursor.lastrowid


async def get_webhooks() -> list[dict]:
    """Select all active webhooks."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, url, label, is_active, created_at FROM webhooks WHERE is_active = 1"
        )
        rows = await cursor.fetchall()
        return [
            {
                "id": row[0],
                "url": row[1],
                "label": row[2],
                "is_active": bool(row[3]),
                "created_at": row[4],
            }
            for row in rows
        ]


async def delete_webhook(webhook_id: int) -> bool:
    """Delete a webhook by id. Return True if deleted."""
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute(
                "DELETE FROM webhooks WHERE id = ?", (webhook_id,)
            )
            await db.commit()
            return cursor.rowcount > 0
    except Exception:
        return False


async def trigger_webhooks(title: str, description: str, date: str | None) -> int:
    """POST to all active webhook URLs using Discord embed format.
    Returns count of successful deliveries."""
    webhooks = await get_webhooks()
    if not webhooks:
        return 0

    payload = {
        "embeds": [
            {
                "title": f"\U0001f4c5 {title}",
                "description": description,
                "color": 0x7C6FFF,
                "fields": [{"name": "Date", "value": date, "inline": True}]
                if date
                else [],
                "footer": {"text": "Forgot Me"},
            }
        ]
    }

    success_count = 0
    async with httpx.AsyncClient(timeout=10.0) as client:
        for webhook in webhooks:
            try:
                resp = await client.post(webhook["url"], json=payload)
                if resp.status_code < 300:
                    success_count += 1
            except Exception:
                logger.warning("Failed to deliver webhook to %s", webhook["url"])
    return success_count
