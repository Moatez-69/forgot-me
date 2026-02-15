from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

# --- Request schemas ---


class ScanRequest(BaseModel):
    file_paths: list[str]
    extensions: list[str] = Field(
        default=[
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
        ]
    )


class IngestRequest(BaseModel):
    file_path: str
    file_content_base64: str
    filename: str


class BatchIngestRequest(BaseModel):
    files: list[IngestRequest]


class QueryRequest(BaseModel):
    question: str
    top_k: int = 5
    conversation_history: list[dict] = []


# --- Response schemas ---


class ScannedFile(BaseModel):
    file_path: str
    file_name: str
    extension: str
    size_bytes: int
    modified_date: str


class ScanResponse(BaseModel):
    files: list[ScannedFile]
    total: int


class IngestResult(BaseModel):
    success: bool
    file_path: str
    description: str = ""
    category: str = ""
    has_events: bool = False
    error: str = ""


class BatchIngestResponse(BaseModel):
    results: list[IngestResult]
    total: int
    successful: int


class SourceFile(BaseModel):
    file_name: str
    file_path: str
    description: str
    category: str
    modality: str = ""
    doc_id: str = ""
    thumbnail: str = ""
    content_snippet: str = ""


class QueryResponse(BaseModel):
    answer: str
    sources: list[SourceFile]
    verified: bool


class MemoryItem(BaseModel):
    file_path: str
    file_name: str
    modality: str
    description: str
    category: str
    summary: str
    timestamp: str
    file_date: str
    has_events: bool
    content_hash: str = ""
    doc_id: str = ""


class MemoriesResponse(BaseModel):
    memories: list[MemoryItem]
    total: int


class NotificationEvent(BaseModel):
    id: int
    title: str
    date: Optional[str]
    description: str
    source_file: str
    source_path: str
    created_at: str


class NotificationsResponse(BaseModel):
    events: list[NotificationEvent]
    total: int


class ServiceStatus(BaseModel):
    name: str
    status: str  # "ok" | "error"
    detail: str = ""


class HealthResponse(BaseModel):
    status: str  # "healthy" | "degraded" | "unhealthy"
    services: list[ServiceStatus]


class DeleteResponse(BaseModel):
    success: bool
    message: str = ""


class EventDeleteResponse(BaseModel):
    success: bool
    deleted_count: int = 0


class GraphNode(BaseModel):
    id: str
    type: str
    label: str
    metadata: dict = {}


class GraphEdge(BaseModel):
    source: str
    target: str
    relationship: str
    weight: float = 0.0


class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    node_count: int
    edge_count: int


class GraphStatsResponse(BaseModel):
    total_nodes: int
    total_edges: int
    file_nodes: int
    category_nodes: int


class RelatedFilesResponse(BaseModel):
    doc_id: str
    related: list[MemoryItem]
    total: int


# --- Webhook schemas ---


class WebhookCreate(BaseModel):
    url: str
    label: str = "Discord"


class WebhookResponse(BaseModel):
    id: int
    url: str
    label: str
    is_active: bool
    created_at: str


class WebhooksListResponse(BaseModel):
    webhooks: list[WebhookResponse]
    total: int


# --- Internal schemas used by LLM parsing ---


class LLMDescription(BaseModel):
    description: str
    category: str
    summary: str


class ExtractedEvent(BaseModel):
    title: str
    date: Optional[str] = None
    description: str


class LLMEventExtraction(BaseModel):
    has_events: bool
    events: list[ExtractedEvent] = []
