import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radii, getCategoryColor } from "../constants/theme";
import type { MemoryItem } from "../services/api";

const MODALITY_ICONS: Record<
  string,
  { name: keyof typeof Ionicons.glyphMap; color: string }
> = {
  pdf: { name: "document-text", color: colors.modalityPdf },
  image: { name: "image", color: colors.modalityImage },
  audio: { name: "musical-notes", color: colors.modalityAudio },
  text: { name: "create", color: colors.modalityText },
  calendar: { name: "calendar", color: colors.modalityCalendar },
  email: { name: "mail", color: colors.modalityEmail },
};

const DEFAULT_ICON = {
  name: "folder" as keyof typeof Ionicons.glyphMap,
  color: colors.textMuted,
};

interface Props {
  item: MemoryItem;
}

export default function MemoryCard({ item }: Props) {
  const iconInfo = MODALITY_ICONS[item.modality] || DEFAULT_ICON;
  const badgeColor = getCategoryColor(item.category);
  const timeAgo = formatTimeAgo(item.timestamp);

  return (
    <View
      style={styles.card}
      accessibilityLabel={`${item.file_name}, ${item.category}, ${item.summary}`}
      accessibilityRole="summary"
    >
      <Ionicons
        name={iconInfo.name}
        size={26}
        color={iconInfo.color}
        style={styles.icon}
      />
      <View style={styles.content}>
        <Text style={styles.fileName} numberOfLines={1}>
          {item.file_name}
        </Text>
        <Text style={styles.summary} numberOfLines={2}>
          {item.summary}
        </Text>
        <View style={styles.footer}>
          <View style={[styles.badge, { backgroundColor: badgeColor }]}>
            <Text style={styles.badgeText}>{item.category}</Text>
          </View>
          <Text style={styles.timestamp}>{timeAgo}</Text>
        </View>
      </View>
    </View>
  );
}

function formatTimeAgo(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return "";
  }
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.xl - 6,
    marginBottom: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: {
    marginRight: spacing.md,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  fileName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  summary: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badge: {
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  timestamp: {
    color: colors.textMuted,
    fontSize: 11,
  },
});
