import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  StorageAccessFramework,
  readAsStringAsync,
  EncodingType,
} from "expo-file-system/legacy";
import { api, FilePayload, IngestResult } from "../services/api";
import FadeIn from "../components/FadeIn";
import {
  colors,
  spacing,
  radii,
  typography,
  getCategoryColor,
} from "../constants/theme";

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

interface DiscoveredFile {
  uri: string;
  name: string;
  selected: boolean;
  status: "idle" | "processing" | "done" | "error";
  result?: IngestResult;
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.substring(dot).toLowerCase() : "";
}

// Push notifications require a development build (not Expo Go).
// This is a placeholder — when using a dev build, import expo-notifications
// here and schedule notifications for future events after ingestion.
async function scheduleEventNotifications(_filesWithEvents: DiscoveredFile[]) {
  // no-op in Expo Go
}

export default function ScanScreen() {
  const [files, setFiles] = useState<DiscoveredFile[]>([]);
  const [scanning, setScanning] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);

  const handleScanFolder = async () => {
    try {
      setScanning(true);

      const permissions =
        await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permissions.granted) {
        setScanning(false);
        return;
      }

      const dirUri = permissions.directoryUri;
      const fileUris = await StorageAccessFramework.readDirectoryAsync(dirUri);

      const discovered: DiscoveredFile[] = [];
      for (const uri of fileUris) {
        const decodedUri = decodeURIComponent(uri);
        const segments = decodedUri.split(/[/:%]/);
        const name = segments[segments.length - 1] || "unknown";
        const ext = getExtension(name);

        if (ALLOWED_EXTENSIONS.includes(ext)) {
          discovered.push({
            uri,
            name,
            selected: true,
            status: "idle",
          });
        }
      }

      if (discovered.length === 0) {
        Alert.alert(
          "No supported files found",
          "The folder does not contain PDF, text, image, or audio files.",
        );
      }

      setFiles(discovered);
    } catch (err: any) {
      Alert.alert("Error scanning folder", err.message || "Unknown error");
    } finally {
      setScanning(false);
    }
  };

  const toggleFile = (index: number) => {
    if (ingesting) return;
    setFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, selected: !f.selected } : f)),
    );
  };

  const handleIngest = async () => {
    const selectedIndices: number[] = [];
    files.forEach((f, i) => {
      if (f.selected && f.status !== "done") selectedIndices.push(i);
    });
    if (selectedIndices.length === 0) {
      Alert.alert("No files selected", "Select at least one file to ingest.");
      return;
    }

    setIngesting(true);
    setProcessedCount(0);
    setTotalToProcess(selectedIndices.length);

    // Mark all selected as processing
    setFiles((prev) =>
      prev.map((f, i) =>
        selectedIndices.includes(i) ? { ...f, status: "processing" } : f,
      ),
    );

    try {
      // Read all files as base64 first
      const payloads: FilePayload[] = [];
      const payloadIndexMap: number[] = []; // maps payload index -> files index
      for (const i of selectedIndices) {
        try {
          const base64 = await readAsStringAsync(files[i].uri, {
            encoding: EncodingType.Base64,
          });
          payloads.push({
            file_path: files[i].uri,
            file_content_base64: base64,
            filename: files[i].name,
          });
          payloadIndexMap.push(i);
        } catch (err: any) {
          setFiles((prev) =>
            prev.map((f, j) =>
              j === i
                ? {
                    ...f,
                    status: "error",
                    result: {
                      success: false,
                      file_path: files[i].uri,
                      description: "",
                      category: "",
                      has_events: false,
                      error: err.message || "Failed to read file",
                    },
                  }
                : f,
            ),
          );
        }
      }

      if (payloads.length > 0) {
        // Send batch request
        const batchResult = await api.ingestBatch(payloads);

        // Map results back to file indices
        setFiles((prev) =>
          prev.map((f, i) => {
            const payloadIdx = payloadIndexMap.indexOf(i);
            if (payloadIdx === -1) return f;
            const result = batchResult.results[payloadIdx];
            if (!result) return f;
            return {
              ...f,
              status: result.success ? "done" : "error",
              result,
            };
          }),
        );
        setProcessedCount(payloads.length);
      }
    } catch (err: any) {
      // Batch failed — fall back to sequential
      for (const i of selectedIndices) {
        if (files[i].status === "done" || files[i].status === "error") continue;
        try {
          const base64 = await readAsStringAsync(files[i].uri, {
            encoding: EncodingType.Base64,
          });
          const result = await api.ingest({
            file_path: files[i].uri,
            file_content_base64: base64,
            filename: files[i].name,
          });
          setFiles((prev) =>
            prev.map((f, j) =>
              j === i
                ? { ...f, status: result.success ? "done" : "error", result }
                : f,
            ),
          );
          setProcessedCount((c) => c + 1);
        } catch (fallbackErr: any) {
          setFiles((prev) =>
            prev.map((f, j) =>
              j === i
                ? {
                    ...f,
                    status: "error",
                    result: {
                      success: false,
                      file_path: files[i].uri,
                      description: "",
                      category: "",
                      has_events: false,
                      error: fallbackErr.message || "Failed to process file",
                    },
                  }
                : f,
            ),
          );
        }
      }
    }

    setIngesting(false);
    const doneCount = files.filter((f) => f.result?.success).length;
    if (doneCount > 0) {
      Alert.alert("Done", `Successfully ingested ${doneCount} file(s).`);

      // Schedule push notifications for files with events
      const filesWithEvents = files.filter(
        (f) => f.result?.success && f.result?.has_events,
      );
      if (filesWithEvents.length > 0) {
        scheduleEventNotifications(filesWithEvents);
      }
    }
  };

  const selectAll = () =>
    setFiles((prev) => prev.map((f) => ({ ...f, selected: true })));
  const deselectAll = () =>
    setFiles((prev) => prev.map((f) => ({ ...f, selected: false })));

  const selectedCount = files.filter((f) => f.selected).length;
  const pendingCount = files.filter(
    (f) => f.selected && f.status !== "done",
  ).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity
        style={styles.scanButton}
        onPress={handleScanFolder}
        disabled={scanning || ingesting}
        activeOpacity={0.7}
        accessibilityLabel={
          files.length > 0
            ? "Scan another folder"
            : "Select folder to scan for files"
        }
        accessibilityRole="button"
      >
        {scanning ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <View style={styles.scanButtonContent}>
            <Ionicons
              name="folder-open"
              size={22}
              color="#fff"
              style={{ marginRight: spacing.sm }}
            />
            <Text style={styles.scanButtonText}>
              {files.length > 0
                ? "Scan Another Folder"
                : "Select Folder to Scan"}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <Text style={styles.hint}>
        Pick a folder to discover all supported files inside it.
      </Text>

      {files.length === 0 && !scanning && (
        <View style={styles.emptyState}>
          <Ionicons
            name="documents-outline"
            size={64}
            color={colors.textMuted}
          />
          <Text style={styles.emptyText}>No files scanned yet</Text>
          <Text style={styles.emptySubtext}>
            Create a folder with your documents, then tap the button above to
            scan it.
          </Text>
        </View>
      )}

      {files.length > 0 && (
        <>
          <View style={styles.selectionRow}>
            <Text style={styles.countText}>
              {selectedCount}/{files.length} selected
            </Text>
            <View style={styles.selectionButtons}>
              <TouchableOpacity
                onPress={selectAll}
                activeOpacity={0.7}
                accessibilityLabel="Select all files"
                accessibilityRole="button"
              >
                <Text style={styles.selectionLink}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={deselectAll}
                activeOpacity={0.7}
                accessibilityLabel="Deselect all files"
                accessibilityRole="button"
              >
                <Text style={styles.selectionLink}>None</Text>
              </TouchableOpacity>
            </View>
          </View>

          {files.map((file, index) => (
            <FadeIn key={`${file.name}-${index}`} delay={index * 40}>
              <TouchableOpacity
                style={[
                  styles.fileCard,
                  file.selected && styles.fileCardSelected,
                  file.status === "done" && styles.fileCardDone,
                  file.status === "error" && styles.fileCardError,
                ]}
                onPress={() => toggleFile(index)}
                disabled={ingesting}
                activeOpacity={0.7}
                accessibilityLabel={`${file.name}, ${file.selected ? "selected" : "not selected"}, ${file.status}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: file.selected }}
              >
                <View style={styles.fileHeader}>
                  <View style={styles.checkbox}>
                    {file.selected && (
                      <Ionicons
                        name="checkmark"
                        size={14}
                        color={colors.primary}
                      />
                    )}
                  </View>
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {file.name}
                    </Text>
                    <Text style={styles.fileExt}>
                      {getExtension(file.name).toUpperCase().slice(1)}
                    </Text>
                  </View>
                  {file.status === "processing" && (
                    <ActivityIndicator size="small" color={colors.primary} />
                  )}
                  {file.status === "done" && (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={colors.success}
                    />
                  )}
                  {file.status === "error" && (
                    <Ionicons
                      name="close-circle"
                      size={20}
                      color={colors.danger}
                    />
                  )}
                </View>

                {file.result?.success && (
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultDesc} numberOfLines={2}>
                      {file.result.description}
                    </Text>
                    <View style={styles.resultFooter}>
                      <View
                        style={[
                          styles.badge,
                          {
                            backgroundColor: `${getCategoryColor(file.result.category)}15`,
                            borderColor: `${getCategoryColor(file.result.category)}40`,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            {
                              color: getCategoryColor(file.result.category),
                            },
                          ]}
                        >
                          {file.result.category}
                        </Text>
                      </View>
                      {file.result.has_events && (
                        <View style={styles.eventsTagRow}>
                          <Ionicons
                            name="calendar"
                            size={12}
                            color={colors.warning}
                          />
                          <Text style={styles.eventsTag}>Has events</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {file.result && !file.result.success && file.result.error && (
                  <Text style={styles.errorText}>{file.result.error}</Text>
                )}
              </TouchableOpacity>
            </FadeIn>
          ))}

          {pendingCount > 0 && (
            <TouchableOpacity
              style={[styles.ingestButton, ingesting && styles.buttonDisabled]}
              onPress={handleIngest}
              disabled={ingesting}
              activeOpacity={0.7}
              accessibilityLabel={`Ingest ${pendingCount} files`}
              accessibilityRole="button"
            >
              {ingesting ? (
                <View style={styles.ingestingRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.ingestButtonText}>
                    {" "}
                    Processing {processedCount} of {totalToProcess}...
                  </Text>
                </View>
              ) : (
                <Text style={styles.ingestButtonText}>
                  Ingest {pendingCount} File{pendingCount !== 1 ? "s" : ""}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: 40 },
  scanButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.xl,
    paddingVertical: spacing.lg + 2,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  scanButtonContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  scanButtonText: { color: "#fff", ...typography.heading },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    marginBottom: spacing.xl,
    letterSpacing: 0.3,
  },
  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: "600",
    marginTop: spacing.lg,
  },
  emptySubtext: {
    color: colors.textDark,
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
  selectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  countText: { color: colors.textSecondary, fontSize: 13 },
  selectionButtons: { flexDirection: "row", gap: spacing.lg },
  selectionLink: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  fileCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fileCardSelected: {
    borderColor: `${colors.primary}50`,
    backgroundColor: colors.cardElevated,
  },
  fileCardDone: {
    borderColor: `${colors.success}40`,
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  fileCardError: {
    borderColor: `${colors.danger}40`,
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
  },
  fileHeader: { flexDirection: "row", alignItems: "center" },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
  },
  fileInfo: { flex: 1 },
  fileName: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  fileExt: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 3,
    letterSpacing: 0.5,
    fontWeight: "600",
  },
  resultInfo: {
    marginTop: spacing.sm + 2,
    paddingTop: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  resultDesc: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  resultFooter: { flexDirection: "row", alignItems: "center" },
  badge: {
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  eventsTagRow: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: spacing.sm,
    gap: 4,
  },
  eventsTag: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: "600",
  },
  errorText: { color: colors.danger, fontSize: 12, marginTop: spacing.sm },
  ingestButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.xl,
    paddingVertical: spacing.lg + 2,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  buttonDisabled: { opacity: 0.5 },
  ingestingRow: { flexDirection: "row", alignItems: "center" },
  ingestButtonText: { color: "#fff", ...typography.heading },
});
