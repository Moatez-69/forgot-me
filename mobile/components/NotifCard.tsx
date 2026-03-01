import React, { useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radii } from "../constants/theme";
import type { NotificationEvent } from "../services/api";

interface Props {
  event: NotificationEvent;
  onDismiss?: (event: NotificationEvent) => void;
}

export default function NotifCard({ event, onDismiss }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const urgency = getUrgency(event.date);

  const handleLongPress = () => {
    if (!onDismiss) return;
    Alert.alert("Dismiss Event", `Remove "${event.title}" from your events?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Dismiss",
        style: "destructive",
        onPress: () => onDismiss(event),
      },
    ]);
  };

  return (
    <TouchableOpacity
      style={styles.touch}
      onPressIn={() =>
        Animated.spring(scale, {
          toValue: 0.985,
          useNativeDriver: true,
          speed: 30,
          bounciness: 4,
        }).start()
      }
      onPressOut={() =>
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 24,
          bounciness: 5,
        }).start()
      }
      delayLongPress={280}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
      accessibilityLabel={`Event: ${event.title}, ${urgency.label || "upcoming"}, ${event.description}. Long press to dismiss.`}
      accessibilityRole="summary"
    >
      <Animated.View
        style={[
          styles.card,
          { borderLeftColor: urgency.color, transform: [{ scale }] },
        ]}
      >
        <View style={styles.header}>
          <View
            style={[styles.iconWrap, { backgroundColor: `${urgency.color}18` }]}
          >
            <Ionicons name="calendar" size={18} color={urgency.color} />
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {event.title}
          </Text>
          {urgency.label !== "" && (
            <View
              style={[
                styles.urgencyBadge,
                {
                  backgroundColor: `${urgency.color}22`,
                  borderColor: `${urgency.color}66`,
                },
              ]}
            >
              <Text style={[styles.urgencyText, { color: urgency.color }]}>
                {urgency.label}
              </Text>
            </View>
          )}
        </View>

        {event.date && (
          <View style={styles.dateRow}>
            <Ionicons name="time-outline" size={13} color={colors.accent} />
            <Text style={styles.date}>{formatDate(event.date)}</Text>
          </View>
        )}

        <Text style={styles.description} numberOfLines={2}>
          {event.description}
        </Text>

        <View style={styles.sourceRow}>
          <Ionicons name="document-outline" size={12} color={colors.textDark} />
          <Text style={styles.source}>{event.source_file}</Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

interface Urgency {
  color: string;
  label: string;
}

function getUrgency(dateStr: string | null): Urgency {
  if (!dateStr) return { color: colors.urgencyDefault, label: "" };

  try {
    const eventDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    if (eventDate < tomorrow)
      return { color: colors.urgencyToday, label: "Today" };
    if (eventDate < new Date(tomorrow.getTime() + 86400000))
      return { color: colors.urgencyTomorrow, label: "Tomorrow" };
    if (eventDate < nextWeek)
      return { color: colors.urgencyThisWeek, label: "This week" };
    return { color: colors.urgencyDefault, label: "" };
  } catch {
    return { color: colors.urgencyDefault, label: "" };
  }
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

const styles = StyleSheet.create({
  touch: {
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm + 2,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
  },
  urgencyBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginLeft: spacing.sm,
    borderWidth: 1,
  },
  urgencyText: {
    fontSize: 11,
    fontWeight: "700",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 1,
    marginBottom: spacing.sm,
  },
  date: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "600",
  },
  description: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.sm,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  source: {
    color: colors.textDark,
    fontSize: 11,
  },
});
