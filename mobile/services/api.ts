import AsyncStorage from "@react-native-async-storage/async-storage";

const BACKEND_URL_KEY = "mindvault_backend_url";
const DEFAULT_URL = "http://192.168.1.100:8000";

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
}

export interface QueryResponse {
  answer: string;
  sources: SourceFile[];
  verified: boolean;
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
  return url || DEFAULT_URL;
}

export async function setBackendUrl(url: string): Promise<void> {
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

  query: (question: string) =>
    post<QueryResponse>("/query", { question, top_k: 5 }),

  getMemories: (category?: string) =>
    get<MemoriesResponse>("/memories", category ? { category } : undefined),

  getNotifications: () => get<NotificationsResponse>("/notifications"),

  health: () => get<HealthResponse>("/health"),
};
