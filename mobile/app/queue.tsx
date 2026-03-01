import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIngestQueue } from "../hooks/useIngestQueue";
import FadeIn from "../components/FadeIn";
import AmbientBackground from "../components/AmbientBackground";
import {
  colors,
  spacing,
  radii,
  typography,
  getCategoryColor,
} from "../constants/theme";

export default function QueueScreen() {
  const {
    queue,
    taskStatus,
    stats,
    loading,
    clearCompleted,
    cancelFile,
    retryFile,
  } = useIngestQueue();

  const handleClear = () => {
    Alert.alert(
      "Clear Completed",
      "Remove all completed and failed files from the queue?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", onPress: clearCompleted },
      ],
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Ionicons name="time-outline" size={20} color={colors.textMuted} />
        );
      case "processing":
        return <ActivityIndicator size="small" color={colors.primary} />;
      case "completed":
        return (
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
        );
      case "failed":
        return <Ionicons name="close-circle" size={20} color={colors.danger} />;
      default:
        return null;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending":
        return "Waiting";
      case "processing":
        return "Processing...";
      case "completed":
        return "Done";
      case "failed":
        return "Failed";
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return colors.textMuted;
      case "processing":
        return colors.primary;
      case "completed":
        return colors.success;
      case "failed":
        return colors.danger;
      default:
        return colors.textSecondary;
    }
  };

  // Progress: completed + failed out of total
  const doneCount = stats.completed + stats.failed;
  const progressPct =
    stats.total > 0 ? Math.round((doneCount / stats.total) * 100) : 0;

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading queue...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AmbientBackground intensity="soft" />
      {/* Status Header */}
      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <Ionicons
            name="cloud-download-outline"
            size={24}
            color={colors.primary}
          />
          <Text style={styles.statusTitle}>Ingestion Queue</Text>
        </View>

        {taskStatus.isRunning ? (
          <View style={styles.runningBadge}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.runningText}>
              Processing
              {taskStatus.currentFile ? `: ${taskStatus.currentFile}` : "..."}
            </Text>
          </View>
        ) : stats.total > 0 && stats.pending === 0 ? (
          <View style={styles.idleBadge}>
            <Ionicons
              name="checkmark-circle"
              size={16}
              color={colors.success}
            />
            <Text style={styles.idleText}>All files processed</Text>
          </View>
        ) : stats.pending > 0 ? (
          <View style={styles.runningBadge}>
            <Ionicons name="time-outline" size={16} color={colors.accent} />
            <Text style={[styles.runningText, { color: colors.accent }]}>
              {stats.pending} file{stats.pending !== 1 ? "s" : ""} waiting
            </Text>
          </View>
        ) : null}

        {/* Progress bar (only when there are files) */}
        {stats.total > 0 && (
          <View style={styles.progressSection}>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${progressPct}%`,
                    backgroundColor:
                      stats.failed > 0 && stats.completed === 0
                        ? colors.danger
                        : colors.success,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {doneCount}/{stats.total} processed
            </Text>
          </View>
        )}

        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.textMuted }]}>
              {stats.pending}
            </Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.primary }]}>
              {stats.processing}
            </Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.success }]}>
              {stats.completed}
            </Text>
            <Text style={styles.statLabel}>Done</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.danger }]}>
              {stats.failed}
            </Text>
            <Text style={styles.statLabel}>Failed</Text>
          </View>
        </View>

        {(stats.completed > 0 || stats.failed > 0) && (
          <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
            <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
            <Text style={styles.clearButtonText}>Clear Completed</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Queue List */}
      {queue.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons
            name="cloud-done-outline"
            size={64}
            color={colors.textMuted}
          />
          <Text style={styles.emptyText}>No files in queue</Text>
          <Text style={styles.emptySubtext}>
            Go to the Scan tab, select files, and tap "Queue" to start
            processing.
          </Text>
        </View>
      ) : (
        <View style={styles.queueList}>
          {queue.map((file, index) => (
            <FadeIn key={file.id} delay={index * 30}>
              <View
                style={[
                  styles.fileCard,
                  file.status === "processing" && styles.fileCardProcessing,
                  file.status === "completed" && styles.fileCardDone,
                  file.status === "failed" && styles.fileCardError,
                ]}
              >
                <View style={styles.fileHeader}>
                  <View style={styles.fileIcon}>
                    {getStatusIcon(file.status)}
                  </View>
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {file.filename}
                    </Text>
                    <Text
                      style={[
                        styles.fileStatus,
                        { color: getStatusColor(file.status) },
                      ]}
                    >
                      {getStatusLabel(file.status)}
                    </Text>
                  </View>

                  {/* Action buttons */}
                  {file.status === "failed" && (
                    <TouchableOpacity
                      style={styles.retryButton}
                      onPress={() => retryFile(file.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="refresh"
                        size={16}
                        color={colors.accent}
                      />
                    </TouchableOpacity>
                  )}
                  {(file.status === "pending" || file.status === "failed") && (
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => cancelFile(file.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="close"
                        size={16}
                        color={colors.textMuted}
                      />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Success result */}
                {file.result?.success && file.result.description && (
                  <View style={styles.resultSection}>
                    <Text style={styles.resultDesc} numberOfLines={2}>
                      {file.result.description}
                    </Text>
                    <View style={styles.resultFooter}>
                      {file.result.category && (
                        <View
                          style={[
                            styles.categoryBadge,
                            {
                              backgroundColor: `${getCategoryColor(file.result.category)}15`,
                              borderColor: `${getCategoryColor(file.result.category)}40`,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.categoryText,
                              {
                                color: getCategoryColor(file.result.category),
                              },
                            ]}
                          >
                            {file.result.category}
                          </Text>
                        </View>
                      )}
                      {file.result.has_events && (
                        <View style={styles.eventsTag}>
                          <Ionicons
                            name="calendar"
                            size={12}
                            color={colors.warning}
                          />
                          <Text style={styles.eventsText}>Events found</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* Error display */}
                {file.status === "failed" &&
                  (file.error || file.result?.error) && (
                    <View style={styles.errorSection}>
                      <Ionicons
                        name="alert-circle"
                        size={14}
                        color={colors.danger}
                      />
                      <Text style={styles.errorText} numberOfLines={2}>
                        {file.error || file.result?.error}
                      </Text>
                    </View>
                  )}

                {/* Retry count & queue time for pending */}
                {file.status === "pending" && (
                  <View style={styles.pendingInfo}>
                    {file.retry_count > 0 && (
                      <Text style={styles.retryText}>
                        Retry {file.retry_count}/3
                      </Text>
                    )}
                    <Text style={styles.queuedTime}>
                      Queued {new Date(file.queued_at).toLocaleTimeString()}
                    </Text>
                  </View>
                )}
              </View>
            </FadeIn>
          ))}
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
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.textSecondary,
    marginTop: spacing.md,
    fontSize: 15,
  },
  // Status card
  statusCard: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statusTitle: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  runningBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: `${colors.primary}15`,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    alignSelf: "flex-start",
    marginBottom: spacing.lg,
  },
  runningText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  idleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: `${colors.success}15`,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    alignSelf: "flex-start",
    marginBottom: spacing.lg,
  },
  idleText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: "600",
  },
  // Progress bar
  progressSection: {
    marginBottom: spacing.lg,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: spacing.xs,
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
  },
  progressText: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: "right",
  },
  // Stats grid
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: spacing.lg,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  clearButtonText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  // Queue list
  queueList: {
    marginBottom: spacing.lg,
  },
  fileCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fileCardProcessing: {
    borderColor: `${colors.primary}50`,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
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
  fileHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  fileIcon: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  fileStatus: {
    fontSize: 12,
    marginTop: 3,
    fontWeight: "600",
  },
  retryButton: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: `${colors.accent}15`,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: spacing.sm,
  },
  cancelButton: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: `${colors.textMuted}15`,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: spacing.sm,
  },
  // Result section
  resultSection: {
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
  resultFooter: {
    flexDirection: "row",
    alignItems: "center",
  },
  categoryBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  eventsTag: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: spacing.sm,
    gap: 4,
  },
  eventsText: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: "600",
  },
  // Error section
  errorSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm + 2,
    paddingTop: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    flex: 1,
  },
  // Pending info
  pendingInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  retryText: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: "600",
  },
  queuedTime: {
    color: colors.textMuted,
    fontSize: 11,
  },
  // Empty state
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
    color: colors.textMuted,
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
});
