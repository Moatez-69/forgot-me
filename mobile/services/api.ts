import AsyncStorage from "@react-native-async-storage/async-storage";

const BACKEND_URL_KEY = "mindvault_backend_url";
const DEFAULT_URL = "http://192.168.50.43:8001";

const ALLOWED_EXTENSIONS = [
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
];

// --- Types ---

export interface FilePayload {
  file_path: string;
  file_content_base64: string;
  filename: string;
}

export interface ScannedFile {
  file_path: string;
  file_name: string;
  extension: string;
  size_bytes: number;
  modified_date: string;
}

export interface ScanResponse {
  files: ScannedFile[];
  total: number;
}

export interface IngestResult {
  success: boolean;
  file_path: string;
  description: string;
  category: string;
  has_events: boolean;
  error: string;
}

export interface BatchIngestResponse {
  results: IngestResult[];
  total: number;
  successful: number;
}

export interface SourceFile {
  file_name: string;
  file_path: string;
  description: string;
  category: string;
  modality: string;
  doc_id: string;
  thumbnail: string; // base64 JPEG thumbnail for images
  content_snippet: string;
}

export interface DeleteResponse {
  success: boolean;
  message: string;
}

export interface EventDeleteResponse {
  success: boolean;
  deleted_count: number;
}

export interface QueryResponse {
  answer: string;
  sources: SourceFile[];
  verified: boolean;
}

/**
 * Build the URL to fetch a stored file from the backend.
 * Used to display images inline or create download links.
 */
let _cachedBaseUrl = DEFAULT_URL;

export function getFileUrl(docId: string): string {
  return `${_cachedBaseUrl}/files/${docId}`;
}

export interface MemoryItem {
  file_path: string;
  file_name: string;
  modality: string;
  description: string;
  category: string;
  summary: string;
  timestamp: string;
  file_date: string;
  has_events: boolean;
  doc_id: string;
  content_hash: string;
}

export interface MemoriesResponse {
  memories: MemoryItem[];
  total: number;
}

export interface NotificationEvent {
  id: number;
  title: string;
  date: string | null;
  description: string;
  source_file: string;
  source_path: string;
  created_at: string;
}

export interface NotificationsResponse {
  events: NotificationEvent[];
  total: number;
}

export interface ServiceStatus {
  name: string;
  status: string;
  detail: string;
}

export interface HealthResponse {
  status: string;
  services: ServiceStatus[];
}

// --- Fetch helpers (no axios — avoids Node crypto issue in RN) ---

export async function getBackendUrl(): Promise<string> {
  const url = await AsyncStorage.getItem(BACKEND_URL_KEY);
  const resolved = url || DEFAULT_URL;
  _cachedBaseUrl = resolved;
  return resolved;
}

export async function setBackendUrl(url: string): Promise<void> {
  _cachedBaseUrl = url;
  await AsyncStorage.setItem(BACKEND_URL_KEY, url);
}

async function post<T>(
  path: string,
  body: object,
  timeoutMs = 180000,
): Promise<T> {
  const base = await getBackendUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Server error ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(
        "Request timed out. The file may be too large or the server is busy.",
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function get<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const base = await getBackendUrl();
  const query = params ? "?" + new URLSearchParams(params).toString() : "";
  const res = await fetch(`${base}${path}${query}`);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function del<T>(path: string): Promise<T> {
  const base = await getBackendUrl();
  const res = await fetch(`${base}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface GraphResponse {
  nodes: Record<string, any>[];
  edges: Record<string, any>[];
  node_count: number;
  edge_count: number;
}

export interface GraphStatsResponse {
  total_nodes: number;
  total_edges: number;
  file_nodes: number;
  category_nodes: number;
  keyword_nodes: number;
  file_relationships: number;
}

export interface RelatedFilesResponse {
  doc_id: string;
  related: Record<string, any>[];
  total: number;
}

export interface WebhookResponse {
  id: number;
  url: string;
  label: string;
  is_active: boolean;
  created_at: string;
}

export interface WebhooksListResponse {
  webhooks: WebhookResponse[];
  total: number;
}

// --- API functions ---

export const api = {
  scan: (filePaths: string[]) =>
    post<ScanResponse>("/scan", {
      file_paths: filePaths,
      extensions: ALLOWED_EXTENSIONS,
    }),

  ingest: (file: FilePayload) => post<IngestResult>("/ingest", file),

  ingestBatch: (files: FilePayload[]) =>
    post<BatchIngestResponse>("/ingest/batch", { files }),

  query: (
    question: string,
    conversationHistory?: Array<{ question: string; answer: string }>,
  ) =>
    post<QueryResponse>("/query", {
      question,
      top_k: 5,
      conversation_history: conversationHistory || [],
    }),

  getMemories: (category?: string, search?: string) => {
    const params: Record<string, string> = {};
    if (category) params.category = category;
    if (search) params.search = search;
    return get<MemoriesResponse>(
      "/memories",
      Object.keys(params).length > 0 ? params : undefined,
    );
  },

  getNotifications: () => get<NotificationsResponse>("/notifications"),

  health: () => get<HealthResponse>("/health"),

  // Delete operations
  deleteMemory: (docId: string) => del<DeleteResponse>(`/memories/${docId}`),

  deleteEvent: (eventId: number) =>
    del<EventDeleteResponse>(`/events/${eventId}`),

  cleanupEvents: () => post<EventDeleteResponse>("/events/cleanup", {}),

  // File metadata
  getFile: (docId: string) => get<Record<string, any>>(`/files/${docId}`),

  // Knowledge Graph
  getGraph: () => get<GraphResponse>("/graph"),

  getGraphStats: () => get<GraphStatsResponse>("/graph/stats"),

  getGraphFile: (docId: string) =>
    get<Record<string, any>>(`/graph/file/${docId}`),

  getRelatedFiles: (docId: string) =>
    get<RelatedFilesResponse>(`/graph/related/${docId}`),

  getGraphCategory: (category: string) =>
    get<Record<string, any>>(`/graph/category/${category}`),

  // Webhooks
  getWebhooks: () => get<WebhooksListResponse>("/webhooks"),

  addWebhook: (url: string, label: string = "Discord") =>
    post<WebhookResponse>("/webhooks", { url, label }),

  deleteWebhook: (webhookId: number) =>
    del<EventDeleteResponse>(`/webhooks/${webhookId}`),

  testWebhook: (webhookId: number) =>
    post<Record<string, any>>(`/webhooks/${webhookId}/test`, {}),
};
