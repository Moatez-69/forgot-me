import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  Linking,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import QueryInput from "../components/QueryInput";
import MemoryCard from "../components/MemoryCard";
import FadeIn from "../components/FadeIn";
import { api, QueryResponse, MemoryItem, getFileUrl } from "../services/api";
import { showSetup } from "./_layout";
import {
  colors,
  spacing,
  radii,
  typography,
  getCategoryColor,
} from "../constants/theme";

const logoImage = require("../assets/logo.png");

interface ConversationTurn {
  id: number;
  question: string;
  answer: string;
  sources: QueryResponse["sources"];
  verified: boolean;
  showSources: boolean;
}

let _turnId = 0;

export default function HomeScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [recentMemories, setRecentMemories] = useState<MemoryItem[]>([]);
  const [eventCount, setEventCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadRecent = useCallback(async () => {
    try {
      const res = await api.getMemories();
      setRecentMemories(res.memories.slice(0, 5));
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err.message || "Could not reach backend");
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
    try {
      const history = conversation.map((t) => ({
        question: t.question,
        answer: t.answer,
      }));
      const result = await api.query(question, history);
      setConversation((prev) => [
        ...prev,
        {
          id: ++_turnId,
          question,
          answer: result.answer,
          sources: result.sources,
          verified: result.verified,
          showSources: result.sources.length > 0,
        },
      ]);
      // Scroll to bottom after new answer
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    } catch (err: any) {
      setConversation((prev) => [
        ...prev,
        {
          id: ++_turnId,
          question,
          answer: `Error: ${err.message || "Could not reach backend"}`,
          sources: [],
          verified: false,
          showSources: false,
        },
      ]);
    } finally {
      setQueryLoading(false);
    }
  };

  const handleNewConversation = () => {
    if (conversation.length === 0) return;
    Alert.alert("New Conversation", "Clear the current conversation thread?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => setConversation([]),
      },
    ]);
  };

  const handleDeleteTurn = (turnId: number) => {
    setConversation((prev) => prev.filter((t) => t.id !== turnId));
  };

  const handleToggleSources = (turnId: number) => {
    setConversation((prev) =>
      prev.map((t) =>
        t.id === turnId ? { ...t, showSources: !t.showSources } : t,
      ),
    );
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image source={logoImage} style={styles.logoImage} />
          <View>
            <Text style={styles.logo}>Forgot Me</Text>
            <Text style={styles.tagline}>Your second brain</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {eventCount > 0 && (
            <TouchableOpacity
              style={styles.notifBadge}
              onPress={() => router.push("/notifications")}
              activeOpacity={0.7}
              accessibilityLabel={`${eventCount} upcoming events`}
              accessibilityRole="button"
            >
              <Text style={styles.notifCount}>{eventCount}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={showSetup}
            activeOpacity={0.7}
            accessibilityLabel="Open settings"
            accessibilityRole="button"
          >
            <Ionicons
              name="settings-outline"
              size={22}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Query input */}
      <View style={styles.querySection}>
        <QueryInput onSubmit={handleQuery} loading={queryLoading} />
      </View>

      {/* Loading state for query */}
      {queryLoading && (
        <FadeIn>
          <View style={styles.loadingContainer}>
            <Ionicons name="search" size={28} color={colors.primary} />
            <Text style={styles.loadingText}>Searching your memories...</Text>
          </View>
        </FadeIn>
      )}

      {/* Conversation thread */}
      {conversation.length > 0 && (
        <View style={styles.resultSection}>
          <View style={styles.conversationHeader}>
            <Text style={styles.sectionTitle}>
              Conversation ({conversation.length})
            </Text>
            <TouchableOpacity
              onPress={handleNewConversation}
              activeOpacity={0.7}
              accessibilityLabel="Clear conversation"
              accessibilityRole="button"
              style={styles.clearButton}
            >
              <Ionicons name="trash-outline" size={14} color={colors.danger} />
              <Text style={styles.clearButtonText}>Clear all</Text>
            </TouchableOpacity>
          </View>

          {conversation.map((turn) => (
            <FadeIn key={turn.id}>
              <View style={styles.turnContainer}>
                {/* Question row with delete button */}
                <View style={styles.questionRow}>
                  <View style={styles.questionBubble}>
                    <Ionicons
                      name="person"
                      size={14}
                      color={colors.primary}
                      style={{ marginRight: spacing.sm }}
                    />
                    <Text style={styles.questionText}>{turn.question}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDeleteTurn(turn.id)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityLabel="Remove this question"
                    accessibilityRole="button"
                    style={styles.deleteTurnButton}
                  >
                    <Ionicons name="close" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>

                {/* Answer */}
                <View style={styles.answerCard}>
                  <View style={styles.answerHeader}>
                    <Text style={styles.answerLabel}>Answer</Text>
                    {!turn.verified && (
                      <View style={styles.unverifiedBadge}>
                        <Ionicons
                          name="alert-circle"
                          size={12}
                          color={colors.warning}
                        />
                        <Text style={styles.unverified}>Unverified</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.answerText}>{turn.answer}</Text>

                  {/* Sources toggle */}
                  {turn.sources.length > 0 && (
                    <TouchableOpacity
                      onPress={() => handleToggleSources(turn.id)}
                      style={styles.sourcesToggle}
                      activeOpacity={0.7}
                      accessibilityLabel={
                        turn.showSources ? "Hide sources" : "Show sources"
                      }
                    >
                      <Ionicons
                        name={turn.showSources ? "chevron-up" : "chevron-down"}
                        size={14}
                        color={colors.primary}
                      />
                      <Text style={styles.sourcesToggleText}>
                        {turn.showSources ? "Hide" : "Show"}{" "}
                        {turn.sources.length} source
                        {turn.sources.length !== 1 ? "s" : ""}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Sources */}
                {turn.showSources &&
                  turn.sources.map((src, i) => {
                    const isImage = src.modality === "image";
                    const fileUrl = src.doc_id ? getFileUrl(src.doc_id) : "";
                    const thumbnailUri = src.thumbnail
                      ? `data:image/jpeg;base64,${src.thumbnail}`
                      : "";

                    return (
                      <View key={i} style={styles.sourceCard}>
                        {isImage && thumbnailUri ? (
                          <Image
                            source={{ uri: thumbnailUri }}
                            style={styles.sourceImage}
                            resizeMode="cover"
                            accessibilityLabel={`Preview of ${src.file_name}`}
                          />
                        ) : isImage ? (
                          <View style={styles.imagePlaceholder}>
                            <Ionicons
                              name="image-outline"
                              size={28}
                              color={colors.textMuted}
                            />
                            <Text style={styles.placeholderText}>
                              Re-ingest to see preview
                            </Text>
                          </View>
                        ) : null}

                        <View style={styles.sourceInfo}>
                          {!isImage && fileUrl ? (
                            <TouchableOpacity
                              onPress={() => Linking.openURL(fileUrl)}
                              style={styles.docLink}
                              activeOpacity={0.7}
                              accessibilityLabel={`Open ${src.file_name}`}
                              accessibilityRole="link"
                            >
                              <Ionicons
                                name="document-outline"
                                size={18}
                                color={colors.info}
                                style={{ marginRight: spacing.sm }}
                              />
                              <Text style={styles.docLinkText}>
                                {src.file_name}
                              </Text>
                            </TouchableOpacity>
                          ) : (
                            <Text style={styles.sourceFile}>
                              {src.file_name}
                            </Text>
                          )}

                          <Text style={styles.sourceDesc} numberOfLines={3}>
                            {src.description}
                          </Text>
                          <View
                            style={[
                              styles.badge,
                              {
                                backgroundColor: `${getCategoryColor(src.category)}15`,
                                borderColor: `${getCategoryColor(src.category)}40`,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.badgeText,
                                { color: getCategoryColor(src.category) },
                              ]}
                            >
                              {src.category}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
              </View>
            </FadeIn>
          ))}
        </View>
      )}

      {/* Error banner */}
      {loadError && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning" size={18} color={colors.warning} />
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity
            onPress={loadRecent}
            activeOpacity={0.7}
            accessibilityLabel="Retry loading"
            accessibilityRole="button"
          >
            <Text style={styles.retryLink}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Recent memories */}
      {recentMemories.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>Recent Memories</Text>
          {recentMemories.map((item, i) => (
            <FadeIn key={i} delay={i * 60}>
              <MemoryCard item={item} />
            </FadeIn>
          ))}
        </View>
      )}

      {/* Empty state when no memories and no error */}
      {recentMemories.length === 0 &&
        !loadError &&
        conversation.length === 0 &&
        !queryLoading && (
          <View style={styles.emptyState}>
            <Ionicons
              name="sparkles-outline"
              size={48}
              color={colors.textMuted}
            />
            <Text style={styles.emptyText}>Welcome to Forgot Me</Text>
            <Text style={styles.emptySubtext}>
              Head to Scan to ingest your first files, then ask questions here
            </Text>
          </View>
        )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xxl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  logoImage: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
  },
  logo: {
    ...typography.title,
    color: colors.primary,
  },
  tagline: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  notifBadge: {
    backgroundColor: colors.danger,
    borderRadius: radii.pill,
    minWidth: 28,
    height: 28,
    paddingHorizontal: spacing.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  notifCount: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  querySection: {
    marginBottom: spacing.xl,
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: spacing.xxxl,
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  conversationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: `${colors.danger}15`,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: `${colors.danger}30`,
  },
  clearButtonText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "700",
  },
  turnContainer: {
    marginBottom: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  questionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  questionBubble: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.primaryMuted,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  questionText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  deleteTurnButton: {
    padding: spacing.sm,
    marginLeft: spacing.xs,
    marginTop: 2,
  },
  sourcesToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sourcesToggleText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "600",
  },
  resultSection: {
    marginBottom: spacing.xxl,
  },
  answerCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    marginBottom: spacing.md,
  },
  answerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  answerLabel: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: 0.5,
  },
  unverifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  unverified: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: "600",
  },
  answerText: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: spacing.sm + 2,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sourceCard: {
    backgroundColor: colors.cardElevated,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  sourceImage: {
    width: "100%",
    height: 220,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.card,
  },
  imagePlaceholder: {
    width: "100%",
    height: 120,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.card,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  sourceInfo: {
    gap: spacing.xs,
  },
  docLink: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  docLinkIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  docLinkText: {
    color: colors.info,
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
    flex: 1,
  },
  sourceFile: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  sourceDesc: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: spacing.sm - 2,
  },
  badge: {
    alignSelf: "flex-start",
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
  recentSection: {
    marginTop: spacing.sm,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: "600",
    marginTop: spacing.lg,
  },
  emptySubtext: {
    color: colors.textDark,
    fontSize: 14,
    marginTop: spacing.sm - 2,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: "#f39c1244",
    gap: spacing.sm,
  },
  errorText: {
    flex: 1,
    color: colors.warning,
    fontSize: 13,
  },
  retryLink: {
    color: colors.primary,
    fontWeight: "600",
    fontSize: 13,
  },
});
