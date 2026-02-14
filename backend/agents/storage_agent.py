import base64
import hashlib
import logging
import os
from datetime import datetime

from models.schemas import IngestResult
from processors import (
    audio_processor,
    calendar_processor,
    image_processor,
    pdf_processor,
    text_processor,
)
from services import llm_service, notif_service, vector_store

logger = logging.getLogger(__name__)

# Map file extensions to modalities
MODALITY_MAP = {
    ".pdf": "pdf",
    ".jpg": "image",
    ".jpeg": "image",
    ".png": "image",
    ".mp3": "audio",
    ".m4a": "audio",
    ".wav": "audio",
    ".txt": "text",
    ".md": "text",
    ".docx": "text",
    ".eml": "text",
    ".ics": "calendar",
}


def detect_modality(filename: str) -> str:
    """Determine file type from extension."""
    ext = os.path.splitext(filename)[1].lower()
    return MODALITY_MAP.get(ext, "text")


def extract_content(file_bytes: bytes, filename: str, modality: str) -> str:
    """Route to the correct processor based on modality."""
    if modality == "pdf":
        return pdf_processor.extract_text(file_bytes)
    elif modality == "image":
        return image_processor.extract_text(file_bytes)
    elif modality == "audio":
        return audio_processor.extract_text(file_bytes, filename)
    elif modality == "calendar":
        return calendar_processor.extract_text(file_bytes)
    else:
        return text_processor.extract_text(file_bytes, filename)


async def ingest_file(
    file_path: str,
    file_content_base64: str,
    filename: str,
) -> IngestResult:
    """
    Core ingestion pipeline — the heart of MindVault.

    Steps:
    1. Decode base64 content
    2. Detect modality from extension
    3. Extract raw text via processor
    4. LLM generates description, category, summary
    5. LLM checks for events/dates
    6. Store description embedding in ChromaDB
    7. If events found, store them in SQLite
    8. Return result
    """
    try:
        # 1. Decode file content
        file_bytes = base64.b64decode(file_content_base64)

        # 2. Detect modality
        modality = detect_modality(filename)
        logger.info(f"Ingesting {filename} as {modality}")

        # 3. Extract text content
        content = extract_content(file_bytes, filename, modality)
        if not content.strip():
            return IngestResult(
                success=False,
                file_path=file_path,
                error="Could not extract any content from file",
            )

        # 4. Generate description, category, summary via LLM
        desc_result = await llm_service.generate_description(filename, content)
        description = desc_result.get("description", f"File: {filename}")
        category = desc_result.get("category", "other")
        summary = desc_result.get("summary", filename)

        # Validate category
        valid_categories = {"work", "study", "personal", "medical", "finance", "other"}
        if category not in valid_categories:
            category = "other"

        # 5. Check for events/dates
        event_result = await llm_service.extract_events(content)
        has_events = event_result.get("has_events", False)
        events = event_result.get("events", [])

        # 6. Store in ChromaDB — description is what gets embedded, not raw content
        doc_id = hashlib.sha256(file_path.encode()).hexdigest()[:16]
        now = datetime.utcnow().isoformat()

        # Keep a content snippet (first 1500 chars) so the LLM can answer
        # specific questions at query time. The description is still what
        # gets embedded for semantic search.
        content_snippet = content[:1500]

        metadata = {
            "file_path": file_path,
            "file_name": filename,
            "modality": modality,
            "description": description,
            "category": category,
            "timestamp": now,
            "file_date": now,  # Best effort — real date comes from the phone
            "has_events": has_events,
            "summary": summary,
            "content_snippet": content_snippet,
        }
        vector_store.store_document(doc_id, description, metadata)

        # 7. Store events in SQLite if found
        if has_events and events:
            await notif_service.store_events(events, filename, file_path)

        # 8. Return result
        return IngestResult(
            success=True,
            file_path=file_path,
            description=description,
            category=category,
            has_events=has_events,
        )

    except Exception as e:
        logger.error(f"Ingestion failed for {filename}: {e}", exc_info=True)
        return IngestResult(
            success=False,
            file_path=file_path,
            error=str(e),
        )
