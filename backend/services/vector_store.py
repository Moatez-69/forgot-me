from __future__ import annotations

import logging
import os

import chromadb
from models.schemas import MemoryItem
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

# Persistent ChromaDB storage path — survives container restarts
CHROMA_PATH = os.getenv("CHROMA_PATH", "./chroma_db")
COLLECTION_NAME = "mindvault_memories"
DEFAULT_USER_ID = "default"

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


def _where_with_user(
    user_id: str | None,
    *,
    category: str | None = None,
    modality: str | None = None,
) -> dict | None:
    conditions = []
    if user_id:
        conditions.append({"user_id": user_id})
    if category:
        conditions.append({"category": category})
    if modality:
        conditions.append({"modality": modality})

    if not conditions:
        return None
    if len(conditions) == 1:
        return conditions[0]
    return {"$and": conditions}


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


def query_documents(
    question: str,
    top_k: int = 5,
    user_id: str = DEFAULT_USER_ID,
) -> list[dict]:
    """
    Semantic search: embed the question, find closest descriptions.
    Returns list of metadata dicts with distance scores.
    """
    collection = get_collection()
    total_count = collection.count()
    if total_count == 0:
        return []

    embedding = embed_text(question)
    results = collection.query(
        query_embeddings=[embedding],
        n_results=min(max(top_k, 1), total_count),
        where=_where_with_user(user_id),
        include=["metadatas", "documents", "distances"],
    )

    documents = []
    ids = results.get("ids", [[]])
    if not ids or not ids[0]:
        return []

    for i in range(len(ids[0])):
        meta = (results["metadatas"][0][i] or {}).copy()
        meta["distance"] = results["distances"][0][i]
        meta["document"] = results["documents"][0][i]
        meta["doc_id"] = ids[0][i]
        documents.append(meta)
    return documents


def get_all_memories(
    category: str | None = None,
    modality: str | None = None,
    limit: int = 50,
    user_id: str = DEFAULT_USER_ID,
) -> list[MemoryItem]:
    """Fetch stored memories with optional filtering."""
    collection = get_collection()
    if collection.count() == 0:
        return []

    result = collection.get(
        where=_where_with_user(user_id, category=category, modality=modality),
        limit=limit,
        include=["metadatas"],
    )

    memories = []
    for i, meta in enumerate(result["metadatas"]):
        memories.append(
            MemoryItem(
                file_path=meta.get("file_path", ""),
                file_name=meta.get("file_name", ""),
                modality=meta.get("modality", ""),
                description=meta.get("description", ""),
                category=meta.get("category", ""),
                summary="",
                timestamp=meta.get("timestamp", ""),
                file_date="",
                has_events=meta.get("has_events", False),
                doc_id=result["ids"][i] if i < len(result["ids"]) else "",
                content_hash=meta.get("content_hash", ""),
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


def delete_document(doc_id: str, user_id: str = DEFAULT_USER_ID) -> bool:
    """Delete a document from ChromaDB by ID."""
    try:
        if get_document(doc_id, user_id=user_id) is None:
            return False
        collection = get_collection()
        collection.delete(ids=[doc_id])
        return True
    except Exception:
        return False


def get_document(doc_id: str, user_id: str = DEFAULT_USER_ID) -> dict | None:
    """Get a single document's metadata by ID."""
    try:
        collection = get_collection()
        result = collection.get(
            ids=[doc_id], include=["metadatas", "documents", "embeddings"]
        )
        if not result["ids"]:
            return None
        meta = (result["metadatas"][0] or {}).copy()
        if user_id and meta.get("user_id", DEFAULT_USER_ID) != user_id:
            return None
        meta["doc_id"] = doc_id
        if result["documents"]:
            meta["document"] = result["documents"][0]
        return meta
    except Exception:
        return None


def get_related_documents(
    doc_id: str,
    top_k: int = 5,
    user_id: str = DEFAULT_USER_ID,
) -> list[dict]:
    """Find documents similar to a given document."""
    collection = get_collection()
    if collection.count() <= 1:
        return []

    # Get the document's embedding and scope by user.
    result = collection.get(ids=[doc_id], include=["embeddings", "documents", "metadatas"])
    if not result["ids"] or not result["embeddings"]:
        return []

    doc_meta = (result["metadatas"][0] or {}) if result.get("metadatas") else {}
    if user_id and doc_meta.get("user_id", DEFAULT_USER_ID) != user_id:
        return []

    embedding = result["embeddings"][0]

    # Query for similar docs (top_k + 1 because the doc itself will be in results)
    results = collection.query(
        query_embeddings=[embedding],
        n_results=min(max(top_k + 1, 1), collection.count()),
        where=_where_with_user(user_id),
        include=["metadatas", "documents", "distances"],
    )

    related = []
    ids = results.get("ids", [[]])
    if not ids or not ids[0]:
        return []

    for i in range(len(ids[0])):
        rid = ids[0][i]
        if rid == doc_id:
            continue  # Skip self
        meta = (results["metadatas"][0][i] or {}).copy()
        meta["distance"] = results["distances"][0][i]
        meta["doc_id"] = rid
        related.append(meta)
    return related[:top_k]


def get_documents_by_category(
    category: str,
    user_id: str = DEFAULT_USER_ID,
) -> list[dict]:
    """Get all documents in a category."""
    collection = get_collection()
    if collection.count() == 0:
        return []
    result = collection.get(
        where=_where_with_user(user_id, category=category),
        include=["metadatas"],
    )
    docs = []
    for i, meta in enumerate(result["metadatas"]):
        doc = (meta or {}).copy()
        doc["doc_id"] = result["ids"][i]
        docs.append(doc)
    return docs


def get_all_documents_with_metadata(user_id: str = DEFAULT_USER_ID) -> list[dict]:
    """Get all user-scoped documents with metadata and embeddings for graph building."""
    collection = get_collection()
    if collection.count() == 0:
        return []
    result = collection.get(
        where=_where_with_user(user_id),
        include=["metadatas", "embeddings", "documents"],
    )
    docs = []
    for i in range(len(result["ids"])):
        meta = (result["metadatas"][i] or {}).copy()
        meta["doc_id"] = result["ids"][i]
        if result["embeddings"]:
            meta["_embedding"] = result["embeddings"][i]
        docs.append(meta)
    return docs


def search_memories(
    query: str,
    category: str | None = None,
    limit: int = 50,
    user_id: str = DEFAULT_USER_ID,
) -> list[MemoryItem]:
    """Search memories by text match on file_name and description."""
    collection = get_collection()
    if collection.count() == 0:
        return []

    result = collection.get(
        where=_where_with_user(user_id, category=category),
        include=["metadatas"],
    )

    query_lower = query.lower()
    memories = []
    for i, meta in enumerate(result["metadatas"]):
        file_name = meta.get("file_name", "").lower()
        description = meta.get("description", "").lower()
        if query_lower in file_name or query_lower in description:
            memories.append(
                MemoryItem(
                    file_path=meta.get("file_path", ""),
                    file_name=meta.get("file_name", ""),
                    modality=meta.get("modality", ""),
                    description=meta.get("description", ""),
                    category=meta.get("category", ""),
                    summary="",
                    timestamp=meta.get("timestamp", ""),
                    file_date="",
                    has_events=meta.get("has_events", False),
                    doc_id=result["ids"][i],
                    content_hash=meta.get("content_hash", ""),
                )
            )

    memories.sort(key=lambda m: m.timestamp, reverse=True)
    return memories[:limit]


def clear_all_documents(user_id: str | None = DEFAULT_USER_ID) -> int:
    """
    Delete all documents from ChromaDB for one user (or all if user_id is None).
    Returns the number of documents deleted.
    """
    try:
        collection = get_collection()
        if collection.count() == 0:
            return 0

        where = _where_with_user(user_id) if user_id else None
        result = collection.get(where=where, include=[])
        ids = result.get("ids", [])
        if not ids:
            return 0

        collection.delete(ids=ids)
        return len(ids)
    except Exception as e:
        logger.error("Error clearing documents: %s", e)
        return 0
