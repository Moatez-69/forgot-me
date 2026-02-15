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

    result = collection.get(
        where=where_filter,
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
                summary=meta.get("summary", ""),
                timestamp=meta.get("timestamp", ""),
                file_date=meta.get("file_date", ""),
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


def delete_document(doc_id: str) -> bool:
    """Delete a document from ChromaDB by ID."""
    try:
        collection = get_collection()
        collection.delete(ids=[doc_id])
        return True
    except Exception:
        return False


def get_document(doc_id: str) -> dict | None:
    """Get a single document's metadata by ID."""
    try:
        collection = get_collection()
        result = collection.get(
            ids=[doc_id], include=["metadatas", "documents", "embeddings"]
        )
        if not result["ids"]:
            return None
        meta = result["metadatas"][0]
        meta["doc_id"] = doc_id
        if result["documents"]:
            meta["document"] = result["documents"][0]
        return meta
    except Exception:
        return None


def get_related_documents(doc_id: str, top_k: int = 5) -> list[dict]:
    """Find documents similar to a given document."""
    collection = get_collection()
    if collection.count() <= 1:
        return []

    # Get the document's embedding
    result = collection.get(ids=[doc_id], include=["embeddings", "documents"])
    if not result["ids"] or not result["embeddings"]:
        return []

    embedding = result["embeddings"][0]

    # Query for similar docs (top_k + 1 because the doc itself will be in results)
    results = collection.query(
        query_embeddings=[embedding],
        n_results=min(top_k + 1, collection.count()),
        include=["metadatas", "documents", "distances"],
    )

    related = []
    for i in range(len(results["ids"][0])):
        rid = results["ids"][0][i]
        if rid == doc_id:
            continue  # Skip self
        meta = results["metadatas"][0][i]
        meta["distance"] = results["distances"][0][i]
        meta["doc_id"] = rid
        related.append(meta)
    return related[:top_k]


def get_documents_by_category(category: str) -> list[dict]:
    """Get all documents in a category."""
    collection = get_collection()
    if collection.count() == 0:
        return []
    result = collection.get(
        where={"category": category},
        include=["metadatas"],
    )
    docs = []
    for i, meta in enumerate(result["metadatas"]):
        meta["doc_id"] = result["ids"][i]
        docs.append(meta)
    return docs


def get_all_documents_with_metadata() -> list[dict]:
    """Get all documents with their metadata and embeddings for graph building."""
    collection = get_collection()
    if collection.count() == 0:
        return []
    result = collection.get(
        include=["metadatas", "embeddings", "documents"],
    )
    docs = []
    for i in range(len(result["ids"])):
        meta = result["metadatas"][i]
        meta["doc_id"] = result["ids"][i]
        if result["embeddings"]:
            meta["_embedding"] = result["embeddings"][i]
        docs.append(meta)
    return docs


def search_memories(
    query: str,
    category: str | None = None,
    limit: int = 50,
) -> list[MemoryItem]:
    """Search memories by text match on file_name and description."""
    collection = get_collection()
    if collection.count() == 0:
        return []

    # Get all documents (ChromaDB doesn't support text search natively)
    where_filter = None
    if category:
        where_filter = {"category": category}

    result = collection.get(
        where=where_filter,
        include=["metadatas"],
    )

    query_lower = query.lower()
    memories = []
    for i, meta in enumerate(result["metadatas"]):
        file_name = meta.get("file_name", "").lower()
        description = meta.get("description", "").lower()
        summary = meta.get("summary", "").lower()
        if (
            query_lower in file_name
            or query_lower in description
            or query_lower in summary
        ):
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
                    doc_id=result["ids"][i],
                    content_hash=meta.get("content_hash", ""),
                )
            )

    memories.sort(key=lambda m: m.timestamp, reverse=True)
    return memories[:limit]
