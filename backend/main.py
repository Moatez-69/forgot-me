from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from agents import storage_agent
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from models.schemas import (
    BatchIngestRequest,
    BatchIngestResponse,
    HealthResponse,
    IngestRequest,
    IngestResult,
    MemoriesResponse,
    NotificationEvent,
    NotificationsResponse,
    QueryRequest,
    QueryResponse,
    ScannedFile,
    ScanRequest,
    ScanResponse,
    ServiceStatus,
    SourceFile,
)
from services import llm_service, notif_service, vector_store

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {
    ".pdf",
    ".txt",
    ".md",
    ".jpg",
    ".jpeg",
    ".png",
    ".mp3",
    ".m4a",
    ".wav",
    ".docx",
    ".ics",
    ".eml",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup."""
    logger.info("Initializing MindVault backend...")
    await notif_service.init_db()
    # Pre-warm ChromaDB connection
    vector_store.get_collection()
    logger.info("MindVault backend ready")
    yield


app = FastAPI(
    title="MindVault",
    description="Personal cognitive assistant — local-first file intelligence",
    version="1.0.0",
    lifespan=lifespan,
)

# Allow mobile app to connect from any local network IP
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- POST /scan ---
@app.post("/scan", response_model=ScanResponse)
async def scan_files(request: ScanRequest):
    """
    Filter a list of file paths by allowed extensions.
    The mobile app sends all discovered paths; we return only processable ones.
    """
    filtered = []
    allowed = set(request.extensions) if request.extensions else ALLOWED_EXTENSIONS

    for path in request.file_paths:
        ext = os.path.splitext(path)[1].lower()
        if ext not in allowed:
            continue
        # Build file info — size/date come from the phone, we use defaults here
        filtered.append(
            ScannedFile(
                file_path=path,
                file_name=os.path.basename(path),
                extension=ext,
                size_bytes=0,
                modified_date="",
            )
        )

    return ScanResponse(files=filtered, total=len(filtered))


# --- POST /ingest ---
@app.post("/ingest", response_model=IngestResult)
async def ingest_file(request: IngestRequest):
    """Ingest a single file through the storage agent pipeline."""
    return await storage_agent.ingest_file(
        file_path=request.file_path,
        file_content_base64=request.file_content_base64,
        filename=request.filename,
    )


# --- POST /ingest/batch ---
@app.post("/ingest/batch", response_model=BatchIngestResponse)
async def ingest_batch(request: BatchIngestRequest):
    """
    Ingest multiple files concurrently.
    Uses asyncio.gather for parallel processing.
    """
    tasks = [
        storage_agent.ingest_file(
            file_path=f.file_path,
            file_content_base64=f.file_content_base64,
            filename=f.filename,
        )
        for f in request.files
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    processed = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            processed.append(
                IngestResult(
                    success=False,
                    file_path=request.files[i].file_path,
                    error=str(result),
                )
            )
        else:
            processed.append(result)

    successful = sum(1 for r in processed if r.success)
    return BatchIngestResponse(
        results=processed, total=len(processed), successful=successful
    )


# --- POST /query ---
@app.post("/query", response_model=QueryResponse)
async def query_files(request: QueryRequest):
    """
    Semantic search + LLM-powered Q&A over ingested files.
    Includes self-verification step.
    """
    # Retrieve relevant documents from ChromaDB
    docs = vector_store.query_documents(request.question, request.top_k)

    if not docs:
        return QueryResponse(
            answer="I couldn't find relevant information in your files. Try ingesting some files first.",
            sources=[],
            verified=True,
        )

    # Smart relevance filtering:
    # 1. Best match must be under 1.0 (cosine distance) to be useful at all
    # 2. Only include other results within 0.15 of the best match
    #    This drops the "long tail" of unrelated files
    best_distance = docs[0].get("distance", 2.0)

    if best_distance > 1.0:
        return QueryResponse(
            answer="I couldn't find relevant information in your files.",
            sources=[],
            verified=True,
        )

    relevant_docs = [d for d in docs if d.get("distance", 2.0) <= best_distance + 0.15]

    # Build context with content snippets so the LLM can answer specific questions
    context_parts = []
    sources = []
    for doc in relevant_docs:
        snippet = doc.get("content_snippet", "")
        context_parts.append(
            f"File: {doc.get('file_name', 'unknown')}\n"
            f"Description: {doc.get('description', '')}\n"
            f"Content: {snippet}"
        )
        sources.append(
            SourceFile(
                file_name=doc.get("file_name", "unknown"),
                file_path=doc.get("file_path", ""),
                description=doc.get("description", ""),
                category=doc.get("category", ""),
            )
        )

    context = "\n\n---\n\n".join(context_parts)

    # Generate answer using LLM
    answer = await llm_service.answer_query(request.question, context)

    # Self-verification: check if answer is grounded in context
    verified = await llm_service.verify_answer(request.question, context, answer)

    if not verified:
        answer += "\n\n⚠️ Note: This answer may not be fully grounded in your files. Please verify the information."

    return QueryResponse(answer=answer, sources=sources, verified=verified)


# --- GET /memories ---
@app.get("/memories", response_model=MemoriesResponse)
async def get_memories(
    category: str | None = None,
    modality: str | None = None,
    limit: int = 50,
):
    """Retrieve stored memories with optional filtering."""
    memories = vector_store.get_all_memories(
        category=category, modality=modality, limit=limit
    )
    return MemoriesResponse(memories=memories, total=len(memories))


# --- GET /notifications ---
@app.get("/notifications", response_model=NotificationsResponse)
async def get_notifications():
    """Get upcoming events extracted from ingested files."""
    events = await notif_service.get_upcoming_events()
    notif_events = [
        NotificationEvent(
            id=e["id"],
            title=e["title"],
            date=e["date"],
            description=e["description"],
            source_file=e["source_file"],
            source_path=e["source_path"],
            created_at=e["created_at"],
        )
        for e in events
    ]
    return NotificationsResponse(events=notif_events, total=len(notif_events))


# --- GET /health ---
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Check status of all backing services."""
    services = []

    # ChromaDB
    chroma_ok = vector_store.check_connection()
    services.append(
        ServiceStatus(
            name="chromadb",
            status="ok" if chroma_ok else "error",
            detail="Connected" if chroma_ok else "Cannot reach ChromaDB",
        )
    )

    # Ollama
    ollama_ok = await llm_service.check_availability()
    services.append(
        ServiceStatus(
            name="ollama",
            status="ok" if ollama_ok else "error",
            detail="Qwen2.5-3B available"
            if ollama_ok
            else "Ollama not reachable or model not loaded",
        )
    )

    # SQLite
    sqlite_ok = await notif_service.check_connection()
    services.append(
        ServiceStatus(
            name="sqlite",
            status="ok" if sqlite_ok else "error",
            detail="Connected" if sqlite_ok else "Cannot access SQLite",
        )
    )

    all_ok = all(s.status == "ok" for s in services)
    any_ok = any(s.status == "ok" for s in services)
    overall = "healthy" if all_ok else ("degraded" if any_ok else "unhealthy")

    return HealthResponse(status=overall, services=services)
