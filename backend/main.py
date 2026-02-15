from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from agents import storage_agent
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models.schemas import (
    BatchIngestRequest,
    BatchIngestResponse,
    DeleteResponse,
    EventDeleteResponse,
    GraphEdge,
    GraphNode,
    GraphResponse,
    GraphStatsResponse,
    HealthResponse,
    IngestRequest,
    IngestResult,
    MemoriesResponse,
    MemoryItem,
    NotificationEvent,
    NotificationsResponse,
    QueryRequest,
    QueryResponse,
    RelatedFilesResponse,
    ScannedFile,
    ScanRequest,
    ScanResponse,
    ServiceStatus,
    SourceFile,
    WebhookCreate,
    WebhookResponse,
    WebhooksListResponse,
)
from services import llm_service, notif_service, vector_store
from services.notif_service import (
    delete_webhook,
    get_webhooks,
    save_webhook,
    trigger_webhooks,
)

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
    # 1. Best match must be under 1.5 (cosine distance) to be useful at all
    # 2. Only include other results within 0.25 of the best match
    #    This drops the "long tail" of unrelated files
    best_distance = docs[0].get("distance", 2.0)

    if best_distance > 1.5:
        return QueryResponse(
            answer="I couldn't find relevant information in your files.",
            sources=[],
            verified=True,
        )

    relevant_docs = [d for d in docs if d.get("distance", 2.0) <= best_distance + 0.25]

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
                modality=doc.get("modality", ""),
                doc_id=doc.get("doc_id", ""),
                thumbnail=doc.get("thumbnail", ""),
                content_snippet=doc.get("content_snippet", ""),
            )
        )

    context = "\n\n---\n\n".join(context_parts)

    logger.info(
        f"Query: '{request.question}' — {len(relevant_docs)} relevant docs, best_distance={best_distance:.3f}"
    )

    # Generate answer using LLM
    answer = await llm_service.answer_query(
        request.question, context, request.conversation_history
    )

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
    search: str | None = None,
    limit: int = 50,
):
    """Retrieve stored memories with optional filtering."""
    if search:
        memories = vector_store.search_memories(search, category=category, limit=limit)
    else:
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


# --- GET /files/{doc_id} ---
@app.get("/files/{doc_id}")
async def get_file_metadata(doc_id: str):
    """Get file metadata by document ID."""
    doc = vector_store.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "file_name": doc.get("file_name", ""),
        "file_path": doc.get("file_path", ""),
        "description": doc.get("description", ""),
        "category": doc.get("category", ""),
        "modality": doc.get("modality", ""),
        "summary": doc.get("summary", ""),
        "content_snippet": doc.get("content_snippet", ""),
        "thumbnail": doc.get("thumbnail", ""),
        "timestamp": doc.get("timestamp", ""),
        "has_events": doc.get("has_events", False),
        "doc_id": doc_id,
    }


# --- DELETE /memories/{doc_id} ---
@app.delete("/memories/{doc_id}", response_model=DeleteResponse)
async def delete_memory(doc_id: str):
    """Delete a memory and its associated events."""
    doc = vector_store.get_document(doc_id)
    if not doc:
        return DeleteResponse(success=False, message="Document not found")

    file_path = doc.get("file_path", "")
    deleted = vector_store.delete_document(doc_id)
    if not deleted:
        return DeleteResponse(
            success=False, message="Failed to delete from vector store"
        )

    # Cascade: delete associated events
    if file_path:
        await notif_service.delete_events_by_source(file_path)

    return DeleteResponse(
        success=True, message=f"Deleted {doc.get('file_name', doc_id)}"
    )


# --- DELETE /events/{event_id} ---
@app.delete("/events/{event_id}", response_model=EventDeleteResponse)
async def delete_event(event_id: int):
    """Delete a single event."""
    deleted = await notif_service.delete_event(event_id)
    return EventDeleteResponse(success=deleted, deleted_count=1 if deleted else 0)


# --- POST /events/cleanup ---
@app.post("/events/cleanup", response_model=EventDeleteResponse)
async def cleanup_events():
    """Delete all past events."""
    count = await notif_service.delete_past_events()
    return EventDeleteResponse(success=True, deleted_count=count)


# --- GET /graph ---
@app.get("/graph", response_model=GraphResponse)
async def get_graph():
    """Build a knowledge graph from all documents."""
    import numpy as np

    all_docs = vector_store.get_all_documents_with_metadata()

    nodes = []
    edges = []
    categories_seen = set()

    for doc in all_docs:
        doc_id = doc.get("doc_id", "")
        category = doc.get("category", "other")

        # File node
        nodes.append(
            GraphNode(
                id=doc_id,
                type="file",
                label=doc.get("file_name", ""),
                metadata={
                    "category": category,
                    "modality": doc.get("modality", ""),
                    "summary": doc.get("summary", ""),
                    "description": doc.get("description", ""),
                },
            )
        )

        # Category edge
        if category not in categories_seen:
            categories_seen.add(category)
            nodes.append(
                GraphNode(
                    id=f"cat_{category}",
                    type="category",
                    label=category,
                )
            )
        edges.append(
            GraphEdge(
                source=doc_id,
                target=f"cat_{category}",
                relationship="belongs_to",
            )
        )

    # Compute similarity edges between files
    doc_embeddings = [
        (d.get("doc_id", ""), d.get("_embedding"))
        for d in all_docs
        if d.get("_embedding")
    ]
    for i in range(len(doc_embeddings)):
        for j in range(i + 1, len(doc_embeddings)):
            id_a, emb_a = doc_embeddings[i]
            id_b, emb_b = doc_embeddings[j]
            if emb_a is not None and emb_b is not None:
                # Cosine similarity
                a = np.array(emb_a)
                b = np.array(emb_b)
                sim = float(
                    np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9)
                )
                if sim > 0.7:
                    edges.append(
                        GraphEdge(
                            source=id_a,
                            target=id_b,
                            relationship="similar",
                            weight=round(sim, 3),
                        )
                    )

    return GraphResponse(
        nodes=nodes,
        edges=edges,
        node_count=len(nodes),
        edge_count=len(edges),
    )


# --- GET /graph/stats ---
@app.get("/graph/stats", response_model=GraphStatsResponse)
async def get_graph_stats():
    """Get graph statistics."""
    all_docs = vector_store.get_all_documents_with_metadata()
    categories = set(d.get("category", "other") for d in all_docs)
    return GraphStatsResponse(
        total_nodes=len(all_docs) + len(categories),
        total_edges=len(all_docs),  # At minimum, one category edge per file
        file_nodes=len(all_docs),
        category_nodes=len(categories),
    )


# --- GET /graph/file/{doc_id} ---
@app.get("/graph/file/{doc_id}")
async def get_graph_file(doc_id: str):
    """Get a file's graph node and connections."""
    doc = vector_store.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    related = vector_store.get_related_documents(doc_id, top_k=5)
    return {
        "node": {
            "id": doc_id,
            "type": "file",
            "label": doc.get("file_name", ""),
            "metadata": doc,
        },
        "related": related,
        "category": doc.get("category", ""),
    }


# --- GET /graph/related/{doc_id} ---
@app.get("/graph/related/{doc_id}", response_model=RelatedFilesResponse)
async def get_related_files(doc_id: str):
    """Get files related to a given document."""
    related_docs = vector_store.get_related_documents(doc_id, top_k=5)
    related = [
        MemoryItem(
            file_path=d.get("file_path", ""),
            file_name=d.get("file_name", ""),
            modality=d.get("modality", ""),
            description=d.get("description", ""),
            category=d.get("category", ""),
            summary=d.get("summary", ""),
            timestamp=d.get("timestamp", ""),
            file_date=d.get("file_date", ""),
            has_events=d.get("has_events", False),
            doc_id=d.get("doc_id", ""),
            content_hash=d.get("content_hash", ""),
        )
        for d in related_docs
    ]
    return RelatedFilesResponse(doc_id=doc_id, related=related, total=len(related))


# --- GET /graph/category/{category} ---
@app.get("/graph/category/{category}")
async def get_graph_category(category: str):
    """Get all files in a category."""
    docs = vector_store.get_documents_by_category(category)
    return {
        "category": category,
        "files": docs,
        "total": len(docs),
    }


# --- POST /webhooks ---
@app.post("/webhooks", response_model=WebhookResponse)
async def create_webhook(body: WebhookCreate):
    """Register a new Discord webhook URL."""
    webhook_id = await save_webhook(body.url, body.label)
    webhooks = await get_webhooks()
    webhook = next((w for w in webhooks if w["id"] == webhook_id), None)
    if not webhook:
        raise HTTPException(status_code=500, detail="Failed to save webhook")
    return WebhookResponse(
        id=webhook["id"],
        url=webhook["url"],
        label=webhook["label"],
        is_active=webhook["is_active"],
        created_at=webhook["created_at"],
    )


# --- GET /webhooks ---
@app.get("/webhooks", response_model=WebhooksListResponse)
async def list_webhooks():
    """List all active webhooks."""
    webhooks = await get_webhooks()
    items = [
        WebhookResponse(
            id=w["id"],
            url=w["url"],
            label=w["label"],
            is_active=w["is_active"],
            created_at=w["created_at"],
        )
        for w in webhooks
    ]
    return WebhooksListResponse(webhooks=items, total=len(items))


# --- DELETE /webhooks/{webhook_id} ---
@app.delete("/webhooks/{webhook_id}", response_model=EventDeleteResponse)
async def remove_webhook(webhook_id: int):
    """Delete a webhook by ID."""
    deleted = await delete_webhook(webhook_id)
    return EventDeleteResponse(success=deleted, deleted_count=1 if deleted else 0)


# --- POST /webhooks/{webhook_id}/test ---
@app.post("/webhooks/{webhook_id}/test")
async def test_webhook(webhook_id: int):
    """Send a test notification through a specific webhook."""
    webhooks = await get_webhooks()
    webhook = next((w for w in webhooks if w["id"] == webhook_id), None)
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    count = await trigger_webhooks(
        "Test Notification", "This is a test from Forgot Me", None
    )
    return {"success": count > 0, "delivered": count}
