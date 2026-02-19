/**
 * React Hook for managing the ingestion queue.
 * Subscribes to the in-memory event emitter for instant UI updates.
 */

import { useCallback, useReducer } from "react";
import { useFocusEffect } from "expo-router";
import * as BackgroundTask from "../services/backgroundTask";
import type { QueuedFile, TaskStatus } from "../services/backgroundTask";

export function useIngestQueue() {
  // Simple counter to force re-render when notified
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  // Subscribe while the screen is focused; unsubscribe when it loses focus
  useFocusEffect(
    useCallback(() => {
      const unsub = BackgroundTask.subscribe(forceUpdate);
      return unsub;
    }, []),
  );

  // Read directly from the in-memory store on each render
  const queue = BackgroundTask.getQueue();
  const taskStatus = BackgroundTask.getTaskStatus();

  const stats = {
    pending: queue.filter((f) => f.status === "pending").length,
    processing: queue.filter((f) => f.status === "processing").length,
    completed: queue.filter((f) => f.status === "completed").length,
    failed: queue.filter((f) => f.status === "failed").length,
    total: queue.length,
  };

  const addToQueue = useCallback(
    (files: Array<{ file_path: string; filename: string }>) => {
      BackgroundTask.addToQueue(files);
    },
    [],
  );

  const clearCompleted = useCallback(() => {
    BackgroundTask.clearCompletedFiles();
  }, []);

  const cancelFile = useCallback((fileId: string) => {
    BackgroundTask.cancelFile(fileId);
  }, []);

  const retryFile = useCallback((fileId: string) => {
    BackgroundTask.retryFile(fileId);
  }, []);

  return {
    queue,
    taskStatus,
    stats,
    loading: false,
    addToQueue,
    clearCompleted,
    cancelFile,
    retryFile,
  };
}
