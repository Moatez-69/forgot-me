from __future__ import annotations

import os

import chromadb
from models.schemas import MemoryItem
from sentence_transformers import SentenceTransformer

# Persistent ChromaDB storage path — survives container restarts
CHROMA_PATH = os.getenv("CHROMA_PATH", "./chroma_db")
COLLECTION_NAME = "mindvault_memories"

# Singleton instances to avoid re-initialization on every request
_client: chromadb.PersistentClient | None = None
_collection: chromadb.Collection | None = None
_embedder: SentenceTransformer | None = None


def get_embedder() -> SentenceTransformer:
    """Lazy-load the sentence transformer model once."""
    global _embedder
    if _embedder is None:
        _embedder = SentenceTransformer("all-MiniLM-L6-v2")
    return _embedder


def get_client() -> chromadb.PersistentClient:
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(path=CHROMA_PATH)
    return _client


def get_collection() -> chromadb.Collection:
    """Get or create the main collection. ChromaDB handles dedup by ID."""
    global _collection
    if _collection is None:
        client = get_client()
        _collection = client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},  # cosine similarity for semantic search
        )
    return _collection


def embed_text(text: str) -> list[float]:
    """Generate a 384-dim embedding vector from text."""
    model = get_embedder()
    return model.encode(text).tolist()


def store_document(
    doc_id: str,
    description: str,
    metadata: dict,
) -> None:
    """
    Store a single document in ChromaDB.
    The description is what gets embedded — not the raw file content.
    This is intentional: we search by semantic meaning of the description.
    """
    collection = get_collection()
    embedding = embed_text(description)
    collection.upsert(
        ids=[doc_id],
        embeddings=[embedding],
        documents=[description],
        metadatas=[metadata],
    )


def query_documents(question: str, top_k: int = 5) -> list[dict]:
    """
    Semantic search: embed the question, find closest descriptions.
    Returns list of metadata dicts with distance scores.
    """
    collection = get_collection()
    if collection.count() == 0:
        return []

    embedding = embed_text(question)
    results = collection.query(
        query_embeddings=[embedding],
        n_results=min(top_k, collection.count()),
        include=["metadatas", "documents", "distances"],
    )

    documents = []
    for i in range(len(results["ids"][0])):
        meta = results["metadatas"][0][i]
        meta["distance"] = results["distances"][0][i]
        meta["document"] = results["documents"][0][i]
        documents.append(meta)
    return documents


def get_all_memories(
    category: str | None = None,
    modality: str | None = None,
    limit: int = 50,
) -> list[MemoryItem]:
    """Fetch stored memories with optional filtering."""
    collection = get_collection()
    if collection.count() == 0:
        return []

    where_filter = None
    conditions = []
    if category:
        conditions.append({"category": category})
    if modality:
        conditions.append({"modality": modality})

    if len(conditions) == 1:
        where_filter = conditions[0]
    elif len(conditions) > 1:
        where_filter = {"$and": conditions}

    results = collection.get(
        where=where_filter,
        limit=limit,
        include=["metadatas"],
    )

    memories = []
    for meta in results["metadatas"]:
        memories.append(
            MemoryItem(
                file_path=meta.get("file_path", ""),
                file_name=meta.get("file_name", ""),
                modality=meta.get("modality", ""),
                description=meta.get("description", ""),
                category=meta.get("category", ""),
                summary=meta.get("summary", ""),
                timestamp=meta.get("timestamp", ""),
                file_date=meta.get("file_date", ""),
                has_events=meta.get("has_events", False),
            )
        )

    # Sort by ingestion timestamp descending (newest first)
    memories.sort(key=lambda m: m.timestamp, reverse=True)
    return memories[:limit]


def check_connection() -> bool:
    """Health check — verify ChromaDB is reachable."""
    try:
        client = get_client()
        client.heartbeat()
        return True
    except Exception:
        return False
