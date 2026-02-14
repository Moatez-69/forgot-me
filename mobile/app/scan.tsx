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
import {
  StorageAccessFramework,
  readAsStringAsync,
  EncodingType,
} from "expo-file-system/legacy";
import { api, FilePayload, IngestResult } from "../services/api";

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

export default function ScanScreen() {
  const [files, setFiles] = useState<DiscoveredFile[]>([]);
  const [scanning, setScanning] = useState(false);
  const [ingesting, setIngesting] = useState(false);

  const handleScanFolder = async () => {
    try {
      setScanning(true);

      // Ask user to pick a folder — grants read access to all files inside
      const permissions =
        await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permissions.granted) {
        setScanning(false);
        return;
      }

      const dirUri = permissions.directoryUri;

      // List all files in the selected directory
      const fileUris = await StorageAccessFramework.readDirectoryAsync(dirUri);

      // Filter by allowed extensions and build file list
      const discovered: DiscoveredFile[] = [];
      for (const uri of fileUris) {
        // SAF URIs encode the filename — decode it
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
    const selected = files.filter((f) => f.selected && f.status !== "done");
    if (selected.length === 0) {
      Alert.alert("No files selected", "Select at least one file to ingest.");
      return;
    }

    setIngesting(true);

    for (let i = 0; i < files.length; i++) {
      if (!files[i].selected || files[i].status === "done") continue;

      setFiles((prev) =>
        prev.map((f, j) => (j === i ? { ...f, status: "processing" } : f)),
      );

      try {
        // Read file content as base64 via SAF
        const base64 = await readAsStringAsync(files[i].uri, {
          encoding: EncodingType.Base64,
        });

        const payload: FilePayload = {
          file_path: files[i].uri,
          file_content_base64: base64,
          filename: files[i].name,
        };

        const result = await api.ingest(payload);

        setFiles((prev) =>
          prev.map((f, j) =>
            j === i
              ? { ...f, status: result.success ? "done" : "error", result }
              : f,
          ),
        );
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
                    error: err.message || "Failed to process file",
                  },
                }
              : f,
          ),
        );
      }
    }

    setIngesting(false);
    const doneCount = files.filter((f) => f.result?.success).length;
    if (doneCount > 0) {
      Alert.alert("Done", `Successfully ingested ${doneCount} file(s).`);
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
      >
        {scanning ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.scanButtonText}>
            {files.length > 0 ? "Scan Another Folder" : "Select Folder to Scan"}
          </Text>
        )}
      </TouchableOpacity>

      <Text style={styles.hint}>
        Pick a folder and MindVault will discover all supported files inside it.
      </Text>

      {files.length === 0 && !scanning && (
        <View style={styles.emptyState}>
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
              <TouchableOpacity onPress={selectAll}>
                <Text style={styles.selectionLink}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={deselectAll}>
                <Text style={styles.selectionLink}>None</Text>
              </TouchableOpacity>
            </View>
          </View>

          {files.map((file, index) => (
            <TouchableOpacity
              key={`${file.name}-${index}`}
              style={[
                styles.fileCard,
                file.selected && styles.fileCardSelected,
                file.status === "done" && styles.fileCardDone,
                file.status === "error" && styles.fileCardError,
              ]}
              onPress={() => toggleFile(index)}
              disabled={ingesting}
            >
              <View style={styles.fileHeader}>
                <View style={styles.checkbox}>
                  {file.selected && <View style={styles.checkboxInner} />}
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
                  <ActivityIndicator size="small" color="#6c63ff" />
                )}
                {file.status === "done" && (
                  <Text style={styles.doneLabel}>Done</Text>
                )}
                {file.status === "error" && (
                  <Text style={styles.errorLabel}>Failed</Text>
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
                          backgroundColor: getBadgeColor(file.result.category),
                        },
                      ]}
                    >
                      <Text style={styles.badgeText}>
                        {file.result.category}
                      </Text>
                    </View>
                    {file.result.has_events && (
                      <Text style={styles.eventsTag}>Has events</Text>
                    )}
                  </View>
                </View>
              )}

              {file.result && !file.result.success && file.result.error && (
                <Text style={styles.errorText}>{file.result.error}</Text>
              )}
            </TouchableOpacity>
          ))}

          {pendingCount > 0 && (
            <TouchableOpacity
              style={[styles.ingestButton, ingesting && styles.buttonDisabled]}
              onPress={handleIngest}
              disabled={ingesting}
            >
              {ingesting ? (
                <View style={styles.ingestingRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.ingestButtonText}> Processing...</Text>
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

function getBadgeColor(category: string): string {
  const colors: Record<string, string> = {
    work: "#4a9eff",
    study: "#ff9f43",
    personal: "#54a0ff",
    medical: "#ee5a24",
    finance: "#2ecc71",
    other: "#a0a0a0",
  };
  return colors[category] || colors.other;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a" },
  content: { padding: 20, paddingBottom: 40 },
  scanButton: {
    backgroundColor: "#6c63ff",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 8,
  },
  scanButtonText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  hint: {
    color: "#555",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 20,
  },
  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyText: { color: "#a0a0b0", fontSize: 18, fontWeight: "600" },
  emptySubtext: {
    color: "#555",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  selectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  countText: { color: "#a0a0b0", fontSize: 13 },
  selectionButtons: { flexDirection: "row", gap: 16 },
  selectionLink: { color: "#6c63ff", fontSize: 13, fontWeight: "600" },
  fileCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#2d2d44",
  },
  fileCardSelected: { borderColor: "#6c63ff55" },
  fileCardDone: { borderColor: "#2ecc7155" },
  fileCardError: { borderColor: "#e74c3c55" },
  fileHeader: { flexDirection: "row", alignItems: "center" },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#6c63ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  checkboxInner: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: "#6c63ff",
  },
  fileInfo: { flex: 1 },
  fileName: { color: "#e0e0e0", fontSize: 15, fontWeight: "600" },
  fileExt: { color: "#666", fontSize: 12, marginTop: 2 },
  doneLabel: { color: "#2ecc71", fontWeight: "700", fontSize: 13 },
  errorLabel: { color: "#e74c3c", fontWeight: "700", fontSize: 13 },
  resultInfo: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#2d2d44",
  },
  resultDesc: {
    color: "#a0a0b0",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  resultFooter: { flexDirection: "row", alignItems: "center" },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  eventsTag: {
    color: "#f39c12",
    fontSize: 11,
    fontWeight: "600",
    marginLeft: 8,
  },
  errorText: { color: "#e74c3c", fontSize: 12, marginTop: 8 },
  ingestButton: {
    backgroundColor: "#2ecc71",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  ingestingRow: { flexDirection: "row", alignItems: "center" },
  ingestButtonText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
