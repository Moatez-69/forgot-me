import sys
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

try:
    import chromadb  # noqa: F401

    _chromadb_available = True
except Exception:
    _chromadb_available = False

pytestmark = pytest.mark.skipif(
    not _chromadb_available,
    reason="chromadb cannot be imported (pydantic v1 incompatible with Python 3.14+)",
)


class TestVectorStore:
    def _reset_singletons(self):
        """Reset module-level singletons so temp_chroma fixture takes effect."""
        import services.vector_store as vs

        vs._client = None
        vs._collection = None

    def _make_fake_embedder(self):
        fake = MagicMock()
        fake.encode.side_effect = lambda text: (
            np.random.RandomState(hash(text) % 2**31).rand(384).astype(np.float32)
        )
        return fake

    def _sample_metadata(self, **overrides):
        base = {
            "file_path": "/test/a.pdf",
            "file_name": "a.pdf",
            "modality": "pdf",
            "description": "Test document",
            "category": "work",
            "timestamp": "2025-01-01T00:00:00",
            "file_date": "2025-01-01T00:00:00",
            "has_events": False,
            "summary": "Test",
            "content_snippet": "Some content here.",
        }
        base.update(overrides)
        return base

    def test_store_and_query(self, temp_chroma):
        self._reset_singletons()
        fake_embedder = self._make_fake_embedder()

        with patch("services.vector_store._embedder", fake_embedder):
            from services.vector_store import query_documents, store_document

            metadata = self._sample_metadata(description="Project planning document")
            store_document("doc1", "Project planning document", metadata)

            results = query_documents("project plan", top_k=3)
            assert len(results) >= 1
            assert results[0]["file_name"] == "a.pdf"

    def test_query_empty_collection(self, temp_chroma):
        self._reset_singletons()
        fake_embedder = self._make_fake_embedder()

        with patch("services.vector_store._embedder", fake_embedder):
            from services.vector_store import query_documents

            results = query_documents("anything")
            assert results == []

    def test_get_all_memories_empty(self, temp_chroma):
        self._reset_singletons()

        import services.vector_store as vs

        memories = vs.get_all_memories()
        assert memories == []

    def test_get_all_memories_with_category_filter(self, temp_chroma):
        self._reset_singletons()
        fake_embedder = self._make_fake_embedder()

        with patch("services.vector_store._embedder", fake_embedder):
            import services.vector_store as vs

            for i, cat in enumerate(["work", "study", "work"]):
                vs.store_document(
                    f"doc{i}",
                    f"Document {i}",
                    self._sample_metadata(
                        file_path=f"/test/{i}.pdf",
                        file_name=f"{i}.pdf",
                        category=cat,
                        description=f"Doc {i}",
                        summary=f"Doc {i}",
                    ),
                )

            work_memories = vs.get_all_memories(category="work")
            assert len(work_memories) == 2
            assert all(m.category == "work" for m in work_memories)

    def test_upsert_overwrites(self, temp_chroma):
        self._reset_singletons()
        fake_embedder = self._make_fake_embedder()

        with patch("services.vector_store._embedder", fake_embedder):
            import services.vector_store as vs

            meta = self._sample_metadata(description="v1")
            vs.store_document("same_id", "version 1", meta)
            meta["description"] = "v2"
            vs.store_document("same_id", "version 2", meta)

            collection = vs.get_collection()
            assert collection.count() == 1

    def test_check_connection(self, temp_chroma):
        self._reset_singletons()

        import services.vector_store as vs

        assert vs.check_connection() is True
