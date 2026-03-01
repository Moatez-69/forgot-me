/**
 * Background Task Service for MindVault
 *
 * Processes files in a foreground queue. Files are read as base64 one at a time
 * and sent to the backend — base64 content is NEVER stored in AsyncStorage
 * (Android's AsyncStorage is backed by SQLite with a ~6MB limit, so storing
 * file content there causes SQLITE_FULL / error code 13).
 *
 * Uses an in-memory event emitter so the UI updates when file status changes.
 * Notifications are batched (max once per 300ms) to avoid excessive re-renders.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { readAsStringAsync, EncodingType } from "expo-file-system/legacy";
import { api, IngestResult } from "./api";

let _notificationsModule: any = null;
let _notificationsUnavailableLogged = false;
let _notificationsLoadAttempted = false;

function _isExpoGoClient(): boolean {
  return Constants.appOwnership === "expo";
}

function _getNotificationsModule(): any | null {
  // Expo Go (SDK 53+) does not support android remote notifications.
  if (_isExpoGoClient()) return null;
  if (_notificationsLoadAttempted) return _notificationsModule;

  _notificationsLoadAttempted = true;
  try {
    _notificationsModule = require("expo-notifications");
  } catch {
    _notificationsModule = null;
  }
  return _notificationsModule;
}

const INGEST_QUEUE_KEY = "mindvault_ingest_queue";

// ── Types ──────────────────────────────────────────────────────────

export interface QueuedFile {
  id: string;
  file_path: string;
  filename: string;
  queued_at: number;
  status: "pending" | "processing" | "completed" | "failed";
  result?: IngestResult;
  error?: string;
  retry_count: number;
}

export interface TaskStatus {
  isRunning: boolean;
  lastRun?: number;
  processedCount: number;
  failedCount: number;
  currentFile?: string;
}

// ── In-memory state ────────────────────────────────────────────────

let _queue: QueuedFile[] = [];
let _taskStatus: TaskStatus = {
  isRunning: false,
  processedCount: 0,
  failedCount: 0,
};
let _processing = false;
let _initialized = false;

// ── Event emitter (throttled) ──────────────────────────────────────

type Listener = () => void;
const _listeners = new Set<Listener>();
let _notifyTimer: ReturnType<typeof setTimeout> | null = null;

export function subscribe(listener: Listener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

/** Schedule a batched UI notification (max once per 300ms) */
function _scheduleNotify(): void {
  if (_notifyTimer) return;
  _notifyTimer = setTimeout(() => {
    _notifyTimer = null;
    for (const fn of _listeners) {
      try {
        fn();
      } catch {}
    }
  }, 300);
}

/** Flush notification immediately (used for important transitions) */
function _flushNotify(): void {
  if (_notifyTimer) {
    clearTimeout(_notifyTimer);
    _notifyTimer = null;
  }
  for (const fn of _listeners) {
    try {
      fn();
    } catch {}
  }
}

// ── Persistence (debounced) ────────────────────────────────────────

let _persistTimer: ReturnType<typeof setTimeout> | null = null;

function _schedulePersist(): void {
  if (_persistTimer) return;
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    _doPersist();
  }, 1000);
}

function _doPersist(): void {
  const lightweight = _queue.map((f) => ({
    id: f.id,
    file_path: f.file_path,
    filename: f.filename,
    queued_at: f.queued_at,
    status: f.status,
    result: f.result,
    error: f.error,
    retry_count: f.retry_count,
  }));
  AsyncStorage.setItem(INGEST_QUEUE_KEY, JSON.stringify(lightweight)).catch(
    () => {},
  );
}

function _flushPersist(): void {
  if (_persistTimer) {
    clearTimeout(_persistTimer);
    _persistTimer = null;
  }
  _doPersist();
}

// ── Init ───────────────────────────────────────────────────────────

export async function initBackgroundTasks(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  try {
    const raw = await AsyncStorage.getItem(INGEST_QUEUE_KEY);
    if (raw) {
      try {
        const parsed: any[] = JSON.parse(raw);
        if (parsed.length > 0 && "file_content_base64" in parsed[0]) {
          await AsyncStorage.removeItem(INGEST_QUEUE_KEY);
          _queue = [];
        } else {
          _queue = parsed.map((f) => ({
            ...f,
            status: f.status === "processing" ? "pending" : f.status,
          }));
        }
      } catch {
        await AsyncStorage.removeItem(INGEST_QUEUE_KEY);
        _queue = [];
      }
    }

    if (_queue.some((f) => f.status === "pending")) {
      processIngestQueue();
    }

    console.log("Background tasks initialized, queue size:", _queue.length);
  } catch (error) {
    console.error("Failed to initialize background tasks:", error);
  }
}

// ── Public getters ─────────────────────────────────────────────────

/** Returns the current queue. This is a snapshot; callers should not mutate it. */
export function getQueue(): readonly QueuedFile[] {
  return _queue;
}

export function getTaskStatus(): TaskStatus {
  return _taskStatus;
}

export function getQueueStats() {
  return {
    pending: _queue.filter((f) => f.status === "pending").length,
    processing: _queue.filter((f) => f.status === "processing").length,
    completed: _queue.filter((f) => f.status === "completed").length,
    failed: _queue.filter((f) => f.status === "failed").length,
    total: _queue.length,
  };
}

// ── Add files ──────────────────────────────────────────────────────

export function addToQueue(
  files: Array<{ file_path: string; filename: string }>,
): void {
  const newItems: QueuedFile[] = files.map((f, index) => ({
    id: `${f.filename}-${Date.now()}-${index}`,
    file_path: f.file_path,
    filename: f.filename,
    queued_at: Date.now(),
    status: "pending" as const,
    retry_count: 0,
  }));

  _queue = [..._queue, ...newItems];
  _schedulePersist();
  _flushNotify(); // immediate so the user sees "X pending" right away

  processIngestQueue();
}

// ── Core processing loop ───────────────────────────────────────────

export async function processIngestQueue(): Promise<void> {
  if (_processing) return;
  _processing = true;

  _taskStatus = { ..._taskStatus, isRunning: true };
  _flushNotify();

  let processed = 0;
  let failed = 0;

  try {
    while (true) {
      const next = _queue.find((f) => f.status === "pending");
      if (!next) break;

      // Mark as processing
      next.status = "processing";
      _taskStatus = { ..._taskStatus, currentFile: next.filename };
      _scheduleNotify();

      try {
        const base64 = await readAsStringAsync(next.file_path, {
          encoding: EncodingType.Base64,
        });

        const result = await api.ingest({
          file_path: next.file_path,
          file_content_base64: base64,
          filename: next.filename,
        });

        next.result = result;
        next.status = result.success ? "completed" : "failed";
        if (!result.success) {
          next.error = result.error || "Ingestion failed";
        }

        if (result.success) {
          processed++;
          if (result.has_events) {
            _sendNotification(
              next.filename,
              "Event detected!",
              `Found upcoming events in ${next.filename}`,
            );
          }
        } else {
          failed++;
        }
      } catch (error: any) {
        console.error(`Failed to ingest ${next.filename}:`, error);

        if (next.retry_count < 3) {
          next.retry_count += 1;
          next.status = "pending";
          next.error = error?.message || "Network error, retrying...";
        } else {
          next.status = "failed";
          next.error = error?.message || "Failed after 3 retries";
          failed++;
          _sendNotification(
            next.filename,
            "Ingestion failed",
            error?.message || "Could not process file",
          );
        }
      }

      // Notify + persist after each file completes (batched)
      _scheduleNotify();
      _schedulePersist();
    }
  } finally {
    _taskStatus = {
      isRunning: false,
      lastRun: Date.now(),
      processedCount: _taskStatus.processedCount + processed,
      failedCount: _taskStatus.failedCount + failed,
      currentFile: undefined,
    };
    _processing = false;
    _flushPersist();
    _flushNotify();
  }
}

// ── Queue management ───────────────────────────────────────────────

export function clearCompletedFiles(): void {
  _queue = _queue.filter(
    (f) => f.status === "pending" || f.status === "processing",
  );
  _flushPersist();
  _flushNotify();
}

export function cancelFile(fileId: string): void {
  _queue = _queue.filter((f) => f.id !== fileId);
  _flushPersist();
  _flushNotify();
}

export function retryFile(fileId: string): void {
  const file = _queue.find((f) => f.id === fileId);
  if (file && file.status === "failed") {
    file.status = "pending";
    file.retry_count = 0;
    file.error = undefined;
    file.result = undefined;
    _flushPersist();
    _flushNotify();
    processIngestQueue();
  }
}

// ── Push notifications ─────────────────────────────────────────────

function _sendNotification(
  filename: string,
  title: string,
  body: string,
): void {
  const Notifications = _getNotificationsModule();
  if (!Notifications) {
    if (!_notificationsUnavailableLogged) {
      _notificationsUnavailableLogged = true;
      console.log(
        "Local notifications disabled in Expo Go. Use a development build to enable them.",
      );
    }
    return;
  }

  Notifications.scheduleNotificationAsync({
    content: { title, body, data: { filename, type: "ingestion" } },
    trigger: null,
  }).catch(() => {});
}
