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
