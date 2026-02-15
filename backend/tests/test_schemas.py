import pytest
from models.schemas import (
    BatchIngestRequest,
    BatchIngestResponse,
    DeleteResponse,
    EventDeleteResponse,
    ExtractedEvent,
    GraphEdge,
    GraphNode,
    GraphResponse,
    GraphStatsResponse,
    HealthResponse,
    IngestRequest,
    IngestResult,
    LLMDescription,
    LLMEventExtraction,
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
from pydantic import ValidationError


class TestScanSchemas:
    def test_scan_request_defaults(self):
        req = ScanRequest(file_paths=["/tmp/a.pdf"])
        assert len(req.extensions) == 12
        assert ".pdf" in req.extensions

    def test_scan_request_custom_extensions(self):
        req = ScanRequest(file_paths=["/tmp/a.pdf"], extensions=[".pdf", ".txt"])
        assert req.extensions == [".pdf", ".txt"]

    def test_scan_request_requires_file_paths(self):
        with pytest.raises(ValidationError):
            ScanRequest()

    def test_scanned_file_roundtrip(self):
        sf = ScannedFile(
            file_path="/a/b.pdf",
            file_name="b.pdf",
            extension=".pdf",
            size_bytes=1024,
            modified_date="2025-01-01",
        )
        assert sf.file_name == "b.pdf"
        assert sf.size_bytes == 1024

    def test_scan_response(self):
        resp = ScanResponse(files=[], total=0)
        assert resp.total == 0


class TestIngestSchemas:
    def test_ingest_request_valid(self):
        req = IngestRequest(
            file_path="/a/b.pdf",
            file_content_base64="dGVzdA==",
            filename="b.pdf",
        )
        assert req.filename == "b.pdf"

    def test_ingest_request_missing_fields(self):
        with pytest.raises(ValidationError):
            IngestRequest(file_path="/a/b.pdf")

    def test_ingest_result_defaults(self):
        r = IngestResult(success=True, file_path="/a.pdf")
        assert r.description == ""
        assert r.category == ""
        assert r.has_events is False
        assert r.error == ""

    def test_batch_ingest_response(self):
        r = BatchIngestResponse(results=[], total=0, successful=0)
        assert r.successful == 0


class TestQuerySchemas:
    def test_query_request_defaults(self):
        q = QueryRequest(question="what is this?")
        assert q.top_k == 5
        assert q.conversation_history == []

    def test_query_request_custom_top_k(self):
        q = QueryRequest(question="test", top_k=10)
        assert q.top_k == 10

    def test_query_request_with_conversation_history(self):
        q = QueryRequest(
            question="follow up",
            conversation_history=[{"question": "hi", "answer": "hello"}],
        )
        assert len(q.conversation_history) == 1

    def test_source_file_new_fields(self):
        src = SourceFile(
            file_name="a.pdf",
            file_path="/a.pdf",
            description="desc",
            category="work",
            modality="pdf",
            doc_id="abc123",
            thumbnail="base64data",
            content_snippet="first 200 chars...",
        )
        assert src.modality == "pdf"
        assert src.doc_id == "abc123"
        assert src.thumbnail == "base64data"
        assert src.content_snippet == "first 200 chars..."

    def test_source_file_defaults(self):
        src = SourceFile(
            file_name="a.pdf",
            file_path="/a.pdf",
            description="desc",
            category="work",
        )
        assert src.modality == ""
        assert src.doc_id == ""
        assert src.thumbnail == ""
        assert src.content_snippet == ""

    def test_query_response(self):
        src = SourceFile(
            file_name="a.pdf",
            file_path="/a.pdf",
            description="desc",
            category="work",
        )
        resp = QueryResponse(answer="42", sources=[src], verified=True)
        assert resp.verified is True
        assert len(resp.sources) == 1


class TestMemorySchemas:
    def test_memory_item(self):
        m = MemoryItem(
            file_path="/a.pdf",
            file_name="a.pdf",
            modality="pdf",
            description="d",
            category="work",
            summary="s",
            timestamp="2025-01-01T00:00:00",
            file_date="2025-01-01T00:00:00",
            has_events=False,
        )
        assert m.modality == "pdf"
        assert m.content_hash == ""
        assert m.doc_id == ""

    def test_memory_item_with_new_fields(self):
        m = MemoryItem(
            file_path="/a.pdf",
            file_name="a.pdf",
            modality="pdf",
            description="d",
            category="work",
            summary="s",
            timestamp="2025-01-01T00:00:00",
            file_date="2025-01-01T00:00:00",
            has_events=False,
            content_hash="abc123",
            doc_id="def456",
        )
        assert m.content_hash == "abc123"
        assert m.doc_id == "def456"

    def test_memories_response(self):
        resp = MemoriesResponse(memories=[], total=0)
        assert resp.total == 0


class TestNotificationSchemas:
    def test_notification_event_nullable_date(self):
        e = NotificationEvent(
            id=1,
            title="t",
            date=None,
            description="d",
            source_file="f",
            source_path="/f",
            created_at="now",
        )
        assert e.date is None

    def test_notifications_response(self):
        resp = NotificationsResponse(events=[], total=0)
        assert resp.total == 0


class TestHealthSchemas:
    def test_service_status(self):
        s = ServiceStatus(name="chromadb", status="ok")
        assert s.detail == ""

    def test_health_response(self):
        h = HealthResponse(status="healthy", services=[])
        assert h.status == "healthy"


class TestLLMInternalSchemas:
    def test_llm_description(self):
        d = LLMDescription(description="d", category="work", summary="s")
        assert d.category == "work"

    def test_extracted_event_optional_date(self):
        e = ExtractedEvent(title="t", description="d")
        assert e.date is None

    def test_extracted_event_with_date(self):
        e = ExtractedEvent(title="t", date="2025-03-01", description="d")
        assert e.date == "2025-03-01"

    def test_llm_event_extraction(self):
        ex = LLMEventExtraction(
            has_events=True,
            events=[ExtractedEvent(title="t", date="2025-03-01", description="d")],
        )
        assert len(ex.events) == 1

    def test_llm_event_extraction_empty(self):
        ex = LLMEventExtraction(has_events=False)
        assert ex.events == []


class TestDeleteSchemas:
    def test_delete_response(self):
        r = DeleteResponse(success=True, message="deleted")
        assert r.success is True
        assert r.message == "deleted"

    def test_delete_response_defaults(self):
        r = DeleteResponse(success=False)
        assert r.message == ""

    def test_event_delete_response(self):
        r = EventDeleteResponse(success=True, deleted_count=3)
        assert r.deleted_count == 3

    def test_event_delete_response_defaults(self):
        r = EventDeleteResponse(success=True)
        assert r.deleted_count == 0


class TestGraphSchemas:
    def test_graph_node(self):
        n = GraphNode(id="abc", type="file", label="test.pdf")
        assert n.metadata == {}

    def test_graph_node_with_metadata(self):
        n = GraphNode(
            id="abc", type="file", label="test.pdf", metadata={"category": "work"}
        )
        assert n.metadata["category"] == "work"

    def test_graph_edge(self):
        e = GraphEdge(source="a", target="b", relationship="similar")
        assert e.weight == 0.0

    def test_graph_edge_with_weight(self):
        e = GraphEdge(source="a", target="b", relationship="similar", weight=0.85)
        assert e.weight == 0.85

    def test_graph_response(self):
        r = GraphResponse(nodes=[], edges=[], node_count=0, edge_count=0)
        assert r.node_count == 0

    def test_graph_stats_response(self):
        r = GraphStatsResponse(
            total_nodes=10, total_edges=5, file_nodes=7, category_nodes=3
        )
        assert r.file_nodes == 7

    def test_related_files_response(self):
        r = RelatedFilesResponse(doc_id="abc", related=[], total=0)
        assert r.doc_id == "abc"


class TestWebhookSchemas:
    def test_webhook_create_defaults(self):
        w = WebhookCreate(url="https://discord.com/api/webhooks/123/abc")
        assert w.label == "Discord"

    def test_webhook_create_custom_label(self):
        w = WebhookCreate(
            url="https://discord.com/api/webhooks/123/abc", label="My Server"
        )
        assert w.label == "My Server"

    def test_webhook_create_requires_url(self):
        with pytest.raises(ValidationError):
            WebhookCreate()

    def test_webhook_response(self):
        w = WebhookResponse(
            id=1,
            url="https://discord.com/api/webhooks/123/abc",
            label="Discord",
            is_active=True,
            created_at="2025-01-01 00:00:00",
        )
        assert w.id == 1
        assert w.is_active is True
        assert w.label == "Discord"

    def test_webhook_response_inactive(self):
        w = WebhookResponse(
            id=2,
            url="https://discord.com/api/webhooks/456/def",
            label="Test",
            is_active=False,
            created_at="2025-06-01 12:00:00",
        )
        assert w.is_active is False

    def test_webhooks_list_response_empty(self):
        r = WebhooksListResponse(webhooks=[], total=0)
        assert r.total == 0
        assert r.webhooks == []

    def test_webhooks_list_response_with_items(self):
        w = WebhookResponse(
            id=1,
            url="https://discord.com/api/webhooks/123/abc",
            label="Discord",
            is_active=True,
            created_at="2025-01-01 00:00:00",
        )
        r = WebhooksListResponse(webhooks=[w], total=1)
        assert r.total == 1
        assert len(r.webhooks) == 1
        assert r.webhooks[0].id == 1
