import logging
import os
from datetime import date, datetime, timedelta

import aiosqlite
import httpx

logger = logging.getLogger(__name__)

DB_PATH = os.getenv("SQLITE_PATH", "./mindvault.db")
DEFAULT_USER_ID = "default"

INIT_SQL = """
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'default',
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
    user_id TEXT NOT NULL DEFAULT 'default',
    url TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT 'Discord',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


async def _ensure_column(db: aiosqlite.Connection, table: str, column: str, ddl: str) -> None:
    cursor = await db.execute(f"PRAGMA table_info({table})")
    rows = await cursor.fetchall()
    existing = {row[1] for row in rows}
    if column not in existing:
        await db.execute(f"ALTER TABLE {table} ADD COLUMN {ddl}")


async def init_db() -> None:
    """Create tables and run lightweight migrations when needed."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(INIT_SQL)
        await db.execute(INIT_WEBHOOKS_SQL)

        await _ensure_column(db, "events", "user_id", "user_id TEXT NOT NULL DEFAULT 'default'")
        await _ensure_column(db, "webhooks", "user_id", "user_id TEXT NOT NULL DEFAULT 'default'")

        await db.commit()


def _parse_event_datetime(raw: str) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


async def store_events(
    events: list[dict],
    source_file: str,
    source_path: str,
    user_id: str = DEFAULT_USER_ID,
) -> int:
    """
    Insert extracted events into SQLite.
    Returns the number of events stored.
    """
    if not events:
        return 0

    async with aiosqlite.connect(DB_PATH) as db:
        count = 0
        inserted_events: list[dict] = []

        for event in events:
            title = event.get("title", "Untitled Event")
            event_date = event.get("date")
            description = event.get("description", "")

            # Dedup per user + file path.
            cursor = await db.execute(
                """
                SELECT COUNT(*)
                FROM events
                WHERE user_id = ? AND title = ? AND date IS ? AND source_path = ?
                """,
                (user_id, title, event_date, source_path),
            )
            row = await cursor.fetchone()
            if row and row[0] > 0:
                continue

            await db.execute(
                """
                INSERT INTO events (user_id, title, date, description, source_file, source_path)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (user_id, title, event_date, description, source_file, source_path),
            )
            inserted_events.append(
                {"title": title, "date": event_date, "description": description}
            )
            count += 1

        await db.commit()

        # Trigger webhooks only for newly inserted events within the next 24h.
        try:
            now = datetime.now()
            tomorrow = now + timedelta(hours=24)
            for event in inserted_events:
                parsed = _parse_event_datetime(event.get("date"))
                if parsed and now <= parsed <= tomorrow:
                    await trigger_webhooks(
                        title=event["title"],
                        description=event["description"],
                        date=event["date"],
                        user_id=user_id,
                    )
        except Exception:
            logger.exception("Failed to trigger webhooks after storing events")

        return count


async def get_upcoming_events(user_id: str = DEFAULT_USER_ID) -> list[dict]:
    """
    Fetch user-scoped events where date >= today.
    Events without a parseable date are included (they might still be relevant).
    """
    today = date.today().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """
            SELECT id, title, date, description, source_file, source_path, created_at
            FROM events
            WHERE user_id = ? AND (date IS NULL OR date >= ?)
            ORDER BY
                CASE WHEN date IS NULL THEN 1 ELSE 0 END,
                date ASC
            """,
            (user_id, today),
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


async def get_event_count(user_id: str = DEFAULT_USER_ID) -> int:
    """Count upcoming user-scoped events for badge display."""
    today = date.today().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT COUNT(*) FROM events WHERE user_id = ? AND (date IS NULL OR date >= ?)",
            (user_id, today),
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


async def delete_event(event_id: int, user_id: str = DEFAULT_USER_ID) -> bool:
    """Delete a single event by ID for one user."""
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute(
                "DELETE FROM events WHERE id = ? AND user_id = ?", (event_id, user_id)
            )
            await db.commit()
            return cursor.rowcount > 0
    except Exception:
        return False


async def delete_events_by_source(
    source_path: str,
    user_id: str = DEFAULT_USER_ID,
) -> int:
    """Delete all events from a specific source file for one user."""
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute(
                "DELETE FROM events WHERE source_path = ? AND user_id = ?",
                (source_path, user_id),
            )
            await db.commit()
            return cursor.rowcount
    except Exception:
        return 0


async def delete_past_events(user_id: str = DEFAULT_USER_ID) -> int:
    """Delete events with dates in the past for one user."""
    today = date.today().isoformat()
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute(
                "DELETE FROM events WHERE user_id = ? AND date IS NOT NULL AND date < ?",
                (user_id, today),
            )
            await db.commit()
            return cursor.rowcount
    except Exception:
        return 0


# --- Webhook functions ---


async def save_webhook(
    url: str,
    label: str = "Discord",
    user_id: str = DEFAULT_USER_ID,
) -> int:
    """Save (replace) the single active webhook for one user and return the row id."""
    async with aiosqlite.connect(DB_PATH) as db:
        # One webhook per user by design: replace existing entries.
        await db.execute("DELETE FROM webhooks WHERE user_id = ?", (user_id,))
        cursor = await db.execute(
            "INSERT INTO webhooks (user_id, url, label, is_active) VALUES (?, ?, ?, 1)",
            (user_id, url, label),
        )
        await db.commit()
        return cursor.lastrowid


async def get_webhooks(user_id: str = DEFAULT_USER_ID) -> list[dict]:
    """Select active webhooks for one user."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """
            SELECT id, url, label, is_active, created_at
            FROM webhooks
            WHERE user_id = ? AND is_active = 1
            """,
            (user_id,),
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


async def delete_webhook(webhook_id: int, user_id: str = DEFAULT_USER_ID) -> bool:
    """Delete a webhook by id for one user."""
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute(
                "DELETE FROM webhooks WHERE id = ? AND user_id = ?", (webhook_id, user_id)
            )
            await db.commit()
            return cursor.rowcount > 0
    except Exception:
        return False


async def trigger_webhooks(
    title: str,
    description: str,
    date: str | None,
    user_id: str = DEFAULT_USER_ID,
    webhook_id: int | None = None,
) -> int:
    """POST to user-scoped webhook URLs using Discord embed format."""
    webhooks = await get_webhooks(user_id=user_id)
    if webhook_id is not None:
        webhooks = [w for w in webhooks if w["id"] == webhook_id]
    if not webhooks:
        return 0

    payload = {
        "embeds": [
            {
                "title": f"Reminder: {title}",
                "description": description,
                "color": 0x2A7FFF,
                "fields": [{"name": "Date", "value": date, "inline": True}] if date else [],
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
                logger.warning("Failed to deliver webhook to id=%s", webhook["id"])
    return success_count


async def clear_all_events(user_id: str | None = DEFAULT_USER_ID) -> int:
    """
    Delete events from SQLite for one user (or all users if user_id is None).
    Returns the number of events deleted.
    """
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            if user_id is None:
                cursor = await db.execute("DELETE FROM events")
            else:
                cursor = await db.execute("DELETE FROM events WHERE user_id = ?", (user_id,))
            await db.commit()
            return cursor.rowcount
    except Exception as e:
        logger.error("Error clearing events: %s", e)
        return 0
