import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import NotifCard from "../components/NotifCard";
import FadeIn from "../components/FadeIn";
import SkeletonCard from "../components/SkeletonCard";
import { api, NotificationEvent } from "../services/api";
import { colors, spacing, radii } from "../constants/theme";

export default function NotificationsScreen() {
  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setError(null);
    try {
      const res = await api.getNotifications();
      setEvents(res.events);
    } catch (err: any) {
      setError(err.message || "Could not load events");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const onRefresh = () => {
    setRefreshing(true);
    loadEvents();
  };

  const handleDismiss = async (event: NotificationEvent) => {
    try {
      await api.deleteEvent(event.id);
      setEvents((prev) => prev.filter((e) => e.id !== event.id));
    } catch (err: any) {
      Alert.alert("Error", err.message || "Could not dismiss event");
    }
  };

  const handleCleanup = () => {
    Alert.alert(
      "Clean Up Past Events",
      "Remove all events with dates that have already passed?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clean Up",
          onPress: async () => {
            try {
              const res = await api.cleanupEvents();
              loadEvents();
              if (res.deleted_count > 0) {
                Alert.alert(
                  "Done",
                  `Removed ${res.deleted_count} past event(s).`,
                );
              } else {
                Alert.alert("Done", "No past events to clean up.");
              }
            } catch (err: any) {
              Alert.alert("Error", err.message || "Could not clean up events");
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      {/* Error banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning" size={18} color={colors.warning} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            onPress={loadEvents}
            activeOpacity={0.7}
            accessibilityLabel="Retry loading events"
            accessibilityRole="button"
          >
            <Text style={styles.retryLink}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.skeletonContainer}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      ) : events.length === 0 && !error ? (
        <View style={styles.centered}>
          <Ionicons
            name="notifications-off-outline"
            size={64}
            color={colors.textMuted}
          />
          <Text style={styles.emptyText}>No upcoming events</Text>
          <Text style={styles.emptySubtext}>
            Events will appear here when extracted from your files
          </Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item, index }) => (
            <FadeIn delay={index * 50}>
              <NotifCard event={item} onDismiss={handleDismiss} />
            </FadeIn>
          )}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            events.length > 0 ? (
              <View style={styles.headerRow}>
                <View style={styles.headerLeft}>
                  <Text style={styles.header}>Upcoming</Text>
                  <View style={styles.countPill}>
                    <Text style={styles.countPillText}>{events.length}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={handleCleanup}
                  activeOpacity={0.7}
                  accessibilityLabel="Clean up past events"
                  accessibilityRole="button"
                  style={styles.cleanupButton}
                >
                  <Ionicons
                    name="trash-outline"
                    size={13}
                    color={colors.accent}
                  />
                  <Text style={styles.cleanupLink}>Clean up</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  skeletonContainer: {
    padding: spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  header: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  countPill: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    minWidth: 24,
    height: 24,
    paddingHorizontal: spacing.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  countPillText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  cleanupButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.accentMuted,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: `${colors.accent}30`,
  },
  cleanupLink: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
    paddingHorizontal: 40,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    margin: spacing.lg,
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
