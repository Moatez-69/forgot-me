import os
import sys

# Ensure the backend package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio


# -- Temp SQLite DB for notif_service tests --
@pytest_asyncio.fixture
async def temp_db(tmp_path):
    db_path = str(tmp_path / "test_mindvault.db")
    with patch("services.notif_service.DB_PATH", db_path):
        from services import notif_service

        await notif_service.init_db()
        yield db_path


# -- Temp ChromaDB for vector_store tests --
@pytest.fixture
def temp_chroma(tmp_path):
    chroma_path = str(tmp_path / "test_chroma")
    with (
        patch("services.vector_store.CHROMA_PATH", chroma_path),
        patch("services.vector_store._client", None),
        patch("services.vector_store._collection", None),
    ):
        yield chroma_path


# -- Mock LLM (avoids needing Ollama running) --
@pytest.fixture
def mock_llm():
    """Patch llm_service.generate to return canned responses."""

    async def fake_generate(prompt, temperature=0.3):
        lower = prompt.lower()
        if "description" in lower and "category" in lower:
            return '{"description": "Test document about testing", "category": "work", "summary": "A test file"}'
        if "events" in lower or "dates" in lower:
            return '{"has_events": false, "events": []}'
        if "yes or no" in lower:
            return "YES"
        return "Based on the files, the answer is 42."

    with patch("services.llm_service.generate", side_effect=fake_generate) as mock:
        yield mock


# -- FastAPI TestClient with all external services mocked --
@pytest.fixture
def api_client(tmp_path, mock_llm):
    """Fully isolated TestClient: temp ChromaDB, temp SQLite, mocked LLM."""
    db_path = str(tmp_path / "api_test.db")
    chroma_path = str(tmp_path / "api_chroma")

    with (
        patch("services.notif_service.DB_PATH", db_path),
        patch("services.vector_store.CHROMA_PATH", chroma_path),
        patch("services.vector_store._client", None),
        patch("services.vector_store._collection", None),
        patch("services.vector_store._embedder", None),
    ):
        from fastapi.testclient import TestClient
        from main import app

        with TestClient(app) as client:
            yield client


# -- Sample file content fixtures --
@pytest.fixture
def sample_pdf_bytes():
    """Minimal valid PDF with text."""
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 50), "This is a test PDF document about project deadlines.")
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


@pytest.fixture
def sample_ics_bytes():
    """Minimal valid .ics calendar file."""
    return b"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
SUMMARY:Team Meeting
DTSTART:20250301T100000Z
DTEND:20250301T110000Z
LOCATION:Room 42
DESCRIPTION:Weekly sync
END:VEVENT
END:VCALENDAR"""
