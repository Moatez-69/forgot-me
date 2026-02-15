import base64
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


class TestHealthEndpoint:
    def test_health_returns_status(self, api_client):
        resp = api_client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert "services" in data
        assert len(data["services"]) == 3

    def test_health_service_names(self, api_client):
        resp = api_client.get("/health")
        data = resp.json()
        names = [s["name"] for s in data["services"]]
        assert "chromadb" in names
        assert "ollama" in names
        assert "sqlite" in names


class TestScanEndpoint:
    def test_scan_filters_by_extension(self, api_client):
        resp = api_client.post(
            "/scan",
            json={
                "file_paths": [
                    "/tmp/a.pdf",
                    "/tmp/b.exe",
                    "/tmp/c.txt",
                    "/tmp/d.jpg",
                ],
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3
        names = [f["file_name"] for f in data["files"]]
        assert "b.exe" not in names
        assert "a.pdf" in names

    def test_scan_custom_extensions(self, api_client):
        resp = api_client.post(
            "/scan",
            json={
                "file_paths": ["/tmp/a.pdf", "/tmp/b.txt"],
                "extensions": [".pdf"],
            },
        )
        data = resp.json()
        assert data["total"] == 1
        assert data["files"][0]["file_name"] == "a.pdf"

    def test_scan_empty_list(self, api_client):
        resp = api_client.post("/scan", json={"file_paths": []})
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


class TestIngestEndpoint:
    def test_ingest_text_file(self, api_client):
        content_b64 = base64.b64encode(b"Meeting notes from Monday standup").decode()

        fake_embedder = MagicMock()
        fake_embedder.encode.side_effect = lambda text: (
            np.random.RandomState(42).rand(384).astype(np.float32)
        )

        with patch("services.vector_store._embedder", fake_embedder):
            resp = api_client.post(
                "/ingest",
                json={
                    "file_path": "/test/notes.txt",
                    "file_content_base64": content_b64,
                    "filename": "notes.txt",
                },
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["category"] in [
            "work",
            "study",
            "personal",
            "medical",
            "finance",
            "other",
        ]

    def test_ingest_invalid_base64(self, api_client):
        resp = api_client.post(
            "/ingest",
            json={
                "file_path": "/test/bad.txt",
                "file_content_base64": "!!!not-base64!!!",
                "filename": "bad.txt",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False


class TestQueryEndpoint:
    def test_query_empty_store(self, api_client):
        resp = api_client.post("/query", json={"question": "What is this?"})
        assert resp.status_code == 200
        data = resp.json()
        assert "answer" in data
        assert "sources" in data
        assert len(data["sources"]) == 0


class TestMemoriesEndpoint:
    def test_get_memories_empty(self, api_client):
        resp = api_client.get("/memories")
        assert resp.status_code == 200
        data = resp.json()
        assert data["memories"] == []
        assert data["total"] == 0


class TestNotificationsEndpoint:
    def test_get_notifications_empty(self, api_client):
        resp = api_client.get("/notifications")
        assert resp.status_code == 200
        data = resp.json()
        assert data["events"] == []
        assert data["total"] == 0


class TestMemoriesSearchEndpoint:
    def test_get_memories_with_search_empty(self, api_client):
        resp = api_client.get("/memories", params={"search": "nonexistent"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["memories"] == []
        assert data["total"] == 0

    def test_get_memories_with_category_and_search(self, api_client):
        resp = api_client.get(
            "/memories", params={"category": "work", "search": "test"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "memories" in data


class TestDeleteEndpoints:
    def test_delete_memory_not_found(self, api_client):
        resp = api_client.delete("/memories/nonexistent_id")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False

    def test_delete_event_not_found(self, api_client):
        resp = api_client.delete("/events/99999")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["deleted_count"] == 0

    def test_cleanup_events(self, api_client):
        resp = api_client.post("/events/cleanup")
        assert resp.status_code == 200
        data = resp.json()
        assert "success" in data
        assert "deleted_count" in data


class TestFileEndpoint:
    def test_get_file_not_found(self, api_client):
        resp = api_client.get("/files/nonexistent_id")
        assert resp.status_code == 404


class TestGraphEndpoints:
    def test_get_graph_empty(self, api_client):
        resp = api_client.get("/graph")
        assert resp.status_code == 200
        data = resp.json()
        assert "nodes" in data
        assert "edges" in data
        assert data["node_count"] >= 0

    def test_get_graph_stats_empty(self, api_client):
        resp = api_client.get("/graph/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_nodes" in data
        assert "file_nodes" in data
        assert "category_nodes" in data

    def test_get_graph_related_not_found(self, api_client):
        resp = api_client.get("/graph/related/nonexistent_id")
        assert resp.status_code == 200
        data = resp.json()
        assert data["related"] == []

    def test_get_graph_category(self, api_client):
        resp = api_client.get("/graph/category/work")
        assert resp.status_code == 200
        data = resp.json()
        assert "nodes" in data

    def test_get_graph_file_not_found(self, api_client):
        resp = api_client.get("/graph/file/nonexistent_id")
        assert resp.status_code == 200


class TestQueryWithHistory:
    def test_query_with_conversation_history(self, api_client):
        resp = api_client.post(
            "/query",
            json={
                "question": "What about the deadline?",
                "conversation_history": [
                    {"question": "What is the project?", "answer": "A todo app"}
                ],
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "answer" in data


class TestWebhookEndpoints:
    def test_get_webhooks_empty(self, api_client):
        resp = api_client.get("/webhooks")
        assert resp.status_code == 200
        data = resp.json()
        assert data["webhooks"] == []
        assert data["total"] == 0

    def test_create_webhook(self, api_client):
        resp = api_client.post(
            "/webhooks",
            json={
                "url": "https://discord.com/api/webhooks/123/abc",
                "label": "Test Server",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["url"] == "https://discord.com/api/webhooks/123/abc"
        assert data["label"] == "Test Server"
        assert data["is_active"] is True
        assert "id" in data
        assert "created_at" in data

    def test_delete_webhook(self, api_client):
        # Create a webhook first
        create_resp = api_client.post(
            "/webhooks",
            json={"url": "https://discord.com/api/webhooks/456/def"},
        )
        assert create_resp.status_code == 200
        webhook_id = create_resp.json()["id"]

        # Delete it
        del_resp = api_client.delete(f"/webhooks/{webhook_id}")
        assert del_resp.status_code == 200
        data = del_resp.json()
        assert data["success"] is True
        assert data["deleted_count"] == 1

        # Verify it's gone
        list_resp = api_client.get("/webhooks")
        assert list_resp.status_code == 200
        assert list_resp.json()["total"] == 0
