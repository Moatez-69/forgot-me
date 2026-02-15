import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import FadeIn from "../components/FadeIn";
import { api, GraphStatsResponse, GraphResponse } from "../services/api";
import { colors, spacing, radii, getCategoryColor } from "../constants/theme";

interface CategoryCluster {
  category: string;
  files: Array<{ id: string; label: string; metadata: Record<string, any> }>;
}

export default function ConnectionsScreen() {
  const [stats, setStats] = useState<GraphStatsResponse | null>(null);
  const [clusters, setClusters] = useState<CategoryCluster[]>([]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [relatedMap, setRelatedMap] = useState<
    Record<string, Array<{ file_name: string; score: number }>>
  >({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [statsRes, graphRes] = await Promise.all([
        api.getGraphStats(),
        api.getGraph(),
      ]);
      setStats(statsRes);

      // Build category clusters from graph nodes
      const categoryMap: Record<string, CategoryCluster> = {};
      const fileNodes = graphRes.nodes.filter((n) => n.type === "file");

      for (const node of fileNodes) {
        const cat = node.metadata?.category || "uncategorized";
        if (!categoryMap[cat]) {
          categoryMap[cat] = { category: cat, files: [] };
        }
        categoryMap[cat].files.push({
          id: node.id,
          label: node.label || node.id,
          metadata: node.metadata || {},
        });
      }

      setClusters(
        Object.values(categoryMap).sort(
          (a, b) => b.files.length - a.files.length,
        ),
      );

      // Build related files map from edges
      const related: Record<
        string,
        Array<{ file_name: string; score: number }>
      > = {};
      const fileEdges = graphRes.edges.filter(
        (e) => e.relationship === "similar",
      );
      const nodeMap: Record<string, string> = {};
      for (const node of fileNodes) {
        nodeMap[node.id] = node.label || node.id;
      }
      for (const edge of fileEdges) {
        if (!related[edge.source]) related[edge.source] = [];
        if (!related[edge.target]) related[edge.target] = [];
        related[edge.source].push({
          file_name: nodeMap[edge.target] || edge.target,
          score: edge.weight || 0,
        });
        related[edge.target].push({
          file_name: nodeMap[edge.source] || edge.source,
          score: edge.weight || 0,
        });
      }
      setRelatedMap(related);
    } catch (err: any) {
      setError(err.message || "Could not load connections");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategory((prev) => (prev === cat ? null : cat));
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Building knowledge graph...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      {/* Error banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning" size={18} color={colors.warning} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            onPress={loadData}
            activeOpacity={0.7}
            accessibilityLabel="Retry loading connections"
            accessibilityRole="button"
          >
            <Text style={styles.retryLink}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Stats bar */}
      {stats && (
        <FadeIn>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.file_nodes}</Text>
              <Text style={styles.statLabel}>Files</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.file_relationships}</Text>
              <Text style={styles.statLabel}>Connections</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.category_nodes}</Text>
              <Text style={styles.statLabel}>Categories</Text>
            </View>
          </View>
        </FadeIn>
      )}

      {/* Empty state */}
      {clusters.length === 0 && !error && (
        <View style={styles.emptyState}>
          <Ionicons
            name="git-network-outline"
            size={64}
            color={colors.textMuted}
          />
          <Text style={styles.emptyText}>No connections yet</Text>
          <Text style={styles.emptySubtext}>
            Ingest some files to see how they connect
          </Text>
        </View>
      )}

      {/* Category clusters */}
      {clusters.map((cluster, idx) => (
        <FadeIn key={cluster.category} delay={idx * 60}>
          <TouchableOpacity
            style={styles.clusterHeader}
            onPress={() => toggleCategory(cluster.category)}
            activeOpacity={0.7}
            accessibilityLabel={`${cluster.category} category, ${cluster.files.length} files`}
            accessibilityRole="button"
          >
            <View style={styles.clusterLeft}>
              <View
                style={[
                  styles.categoryDot,
                  { backgroundColor: getCategoryColor(cluster.category) },
                ]}
              />
              <Text style={styles.clusterTitle}>{cluster.category}</Text>
              <View
                style={[
                  styles.countBadge,
                  {
                    backgroundColor: `${getCategoryColor(cluster.category)}20`,
                    borderColor: `${getCategoryColor(cluster.category)}40`,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.countBadgeText,
                    { color: getCategoryColor(cluster.category) },
                  ]}
                >
                  {cluster.files.length}
                </Text>
              </View>
            </View>
            <Ionicons
              name={
                expandedCategory === cluster.category
                  ? "chevron-up"
                  : "chevron-down"
              }
              size={18}
              color={colors.textMuted}
            />
          </TouchableOpacity>

          {expandedCategory === cluster.category && (
            <View style={styles.clusterBody}>
              {cluster.files.map((file) => {
                const fileRelated = relatedMap[file.id] || [];
                return (
                  <View key={file.id} style={styles.fileItem}>
                    <Ionicons
                      name="document-text-outline"
                      size={16}
                      color={colors.textSecondary}
                      style={{ marginRight: spacing.sm }}
                    />
                    <View style={styles.fileItemContent}>
                      <Text style={styles.fileItemName} numberOfLines={1}>
                        {file.label}
                      </Text>
                      {file.metadata?.description && (
                        <Text style={styles.fileItemDesc} numberOfLines={1}>
                          {file.metadata.description}
                        </Text>
                      )}
                      {fileRelated.length > 0 && (
                        <View style={styles.relatedSection}>
                          <View style={styles.relatedRow}>
                            <Ionicons
                              name="link"
                              size={12}
                              color={colors.accent}
                            />
                            <Text style={styles.relatedLabel}>
                              {fileRelated.length} connection
                              {fileRelated.length !== 1 ? "s" : ""}
                            </Text>
                          </View>
                          {fileRelated.slice(0, 3).map((r, ri) => (
                            <View key={ri} style={styles.relatedItem}>
                              <Text
                                style={styles.relatedText}
                                numberOfLines={1}
                              >
                                {r.file_name}
                              </Text>
                              <View style={styles.scoreBarBg}>
                                <View
                                  style={[
                                    styles.scoreBarFill,
                                    {
                                      width: `${Math.max(r.score * 100, 10)}%`,
                                    },
                                  ]}
                                />
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </FadeIn>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "space-around",
    alignItems: "center",
  },
  statItem: {
    alignItems: "center",
  },
  statNumber: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: "800",
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 4,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontWeight: "600",
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.accent,
    opacity: 0.4,
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
    marginTop: spacing.sm,
    textAlign: "center",
  },
  clusterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clusterLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  clusterTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    textTransform: "capitalize",
    marginRight: spacing.sm,
  },
  countBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
    borderWidth: 1,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: "800",
  },
  clusterBody: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    marginTop: -spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  fileItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  fileItemContent: {
    flex: 1,
  },
  fileItemName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  fileItemDesc: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  relatedSection: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  relatedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: spacing.xs,
  },
  relatedLabel: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "600",
  },
  relatedItem: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: spacing.lg,
    marginBottom: 3,
    gap: spacing.sm,
  },
  relatedText: {
    color: colors.textSecondary,
    fontSize: 11,
    flex: 1,
  },
  scoreBarBg: {
    width: 40,
    height: 3,
    backgroundColor: colors.border,
    borderRadius: 2,
  },
  scoreBarFill: {
    height: 3,
    backgroundColor: colors.accent,
    borderRadius: 2,
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
