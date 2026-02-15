import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import QueryInput from "../components/QueryInput";
import MemoryCard from "../components/MemoryCard";
import { api, QueryResponse, MemoryItem, getFileUrl } from "../services/api";
import { showSetup } from "./_layout";

export default function HomeScreen() {
  const router = useRouter();
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null);
  const [recentMemories, setRecentMemories] = useState<MemoryItem[]>([]);
  const [eventCount, setEventCount] = useState(0);

  const loadRecent = useCallback(async () => {
    try {
      const res = await api.getMemories();
      setRecentMemories(res.memories.slice(0, 5));
    } catch {
      // Silently fail — backend might not be up yet
    }
  }, []);

  const loadEventCount = useCallback(async () => {
    try {
      const res = await api.getNotifications();
      setEventCount(res.total);
    } catch (_) {
      // Backend may not be up yet
    }
  }, []);

  useEffect(() => {
    loadRecent();
    loadEventCount();
  }, [loadRecent, loadEventCount]);

  const handleQuery = async (question: string) => {
    setQueryLoading(true);
    setQueryResult(null);
    try {
      const result = await api.query(question);
      setQueryResult(result);
    } catch (err: any) {
      setQueryResult({
        answer: `Error: ${err.message || "Could not reach backend"}`,
        sources: [],
        verified: false,
      });
    } finally {
      setQueryLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>MindVault</Text>
          <Text style={styles.tagline}>Your cognitive assistant</Text>
        </View>
        <View style={styles.headerRight}>
          {eventCount > 0 && (
            <TouchableOpacity
              style={styles.notifBadge}
              onPress={() => router.push("/notifications")}
            >
              <Text style={styles.notifCount}>{eventCount}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={showSetup}>
            <Text style={styles.settingsLink}>Settings</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Query input */}
      <View style={styles.querySection}>
        <QueryInput onSubmit={handleQuery} loading={queryLoading} />
      </View>

      {/* Query result */}
      {queryLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6c63ff" />
          <Text style={styles.loadingText}>Searching your memories...</Text>
        </View>
      )}

      {queryResult && (
        <View style={styles.resultSection}>
          <View style={styles.answerCard}>
            <View style={styles.answerHeader}>
              <Text style={styles.answerLabel}>Answer</Text>
              {!queryResult.verified && (
                <Text style={styles.unverified}>Unverified</Text>
              )}
            </View>
            <Text style={styles.answerText}>{queryResult.answer}</Text>
          </View>

          {queryResult.sources.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Sources</Text>
              {queryResult.sources.map((src, i) => {
                const isImage = src.modality === "image";
                const fileUrl = src.doc_id ? getFileUrl(src.doc_id) : "";
                const thumbnailUri = src.thumbnail
                  ? `data:image/jpeg;base64,${src.thumbnail}`
                  : "";

                return (
                  <View key={i} style={styles.sourceCard}>
                    {/* Image preview — use inline base64 thumbnail */}
                    {isImage && thumbnailUri ? (
                      <Image
                        source={{ uri: thumbnailUri }}
                        style={styles.sourceImage}
                        resizeMode="cover"
                      />
                    ) : isImage ? (
                      <View style={styles.imagePlaceholder}>
                        <Text style={styles.placeholderIcon}>🖼️</Text>
                        <Text style={styles.placeholderText}>
                          Re-ingest to see preview
                        </Text>
                      </View>
                    ) : null}

                    {/* File name — always shown */}
                    {!isImage && fileUrl ? (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(fileUrl)}
                        style={styles.docLink}
                      >
                        <Text style={styles.docLinkIcon}>📄</Text>
                        <Text style={styles.docLinkText}>{src.file_name}</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.sourceFile}>{src.file_name}</Text>
                    )}

                    <Text style={styles.sourceDesc} numberOfLines={2}>
                      {src.description}
                    </Text>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: getBadgeColor(src.category) },
                      ]}
                    >
                      <Text style={styles.badgeText}>{src.category}</Text>
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </View>
      )}

      {/* Recent memories */}
      {recentMemories.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>Recent Memories</Text>
          {recentMemories.map((item, i) => (
            <MemoryCard key={i} item={item} />
          ))}
        </View>
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
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  logo: {
    fontSize: 28,
    fontWeight: "800",
    color: "#6c63ff",
  },
  tagline: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  notifBadge: {
    backgroundColor: "#e74c3c",
    borderRadius: 14,
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  notifCount: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  settingsLink: {
    color: "#666",
    fontSize: 13,
  },
  querySection: {
    marginBottom: 20,
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 32,
  },
  loadingText: {
    color: "#666",
    marginTop: 12,
    fontSize: 14,
  },
  resultSection: {
    marginBottom: 24,
  },
  answerCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#6c63ff33",
    marginBottom: 12,
  },
  answerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  answerLabel: {
    color: "#6c63ff",
    fontWeight: "700",
    fontSize: 13,
  },
  unverified: {
    color: "#f39c12",
    fontSize: 11,
    fontWeight: "600",
  },
  answerText: {
    color: "#e0e0e0",
    fontSize: 15,
    lineHeight: 22,
  },
  sectionTitle: {
    color: "#a0a0b0",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sourceCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#2d2d44",
  },
  sourceImage: {
    width: "100%",
    height: 180,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#2d2d44",
  },
  imagePlaceholder: {
    width: "100%",
    height: 100,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#252542",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  placeholderText: {
    color: "#666",
    fontSize: 11,
  },
  docLink: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#252542",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  docLinkIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  docLinkText: {
    color: "#6c9eff",
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
    flex: 1,
  },
  sourceFile: {
    color: "#e0e0e0",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  sourceDesc: {
    color: "#a0a0b0",
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 6,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  recentSection: {
    marginTop: 8,
  },
});
