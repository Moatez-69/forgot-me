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
import {
  colors,
  spacing,
  radii,
  getCategoryColor,
  getCategoryIcon,
} from "../constants/theme";
import type { MemoryItem } from "../services/api";

interface Props {
  item: MemoryItem;
  onDelete?: (item: MemoryItem) => void;
}

export default function MemoryCard({ item, onDelete }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const badgeColor = getCategoryColor(item.category);
  const categoryIconName = getCategoryIcon(item.category);
  const timeAgo = formatTimeAgo(item.timestamp);

  const handleLongPress = () => {
    if (!onDelete) return;
    Alert.alert(
      "Delete Memory",
      `Remove "${item.file_name}" from your vault?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => onDelete(item),
        },
      ],
    );
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
      accessibilityLabel={`${item.file_name}, ${item.category}, ${item.summary}. Long press to delete.`}
      accessibilityRole="summary"
    >
      <Animated.View
        style={[
          styles.card,
          { borderLeftColor: badgeColor, transform: [{ scale }] },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: `${badgeColor}15` }]}>
          <Ionicons name={categoryIconName as any} size={22} color={badgeColor} />
        </View>
        <View style={styles.content}>
          <Text style={styles.fileName} numberOfLines={1}>
            {item.file_name}
          </Text>
          <Text style={styles.summary} numberOfLines={2}>
            {item.summary}
          </Text>
          <View style={styles.footer}>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: `${badgeColor}22`,
                  borderColor: `${badgeColor}55`,
                },
              ]}
            >
              <Text style={[styles.badgeText, { color: badgeColor }]}>
                {item.category}
              </Text>
            </View>
            <Text style={styles.timestamp}>{timeAgo}</Text>
          </View>
        </View>
      </Animated.View>
    </TouchableOpacity>
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
  touch: {
    marginBottom: spacing.md,
  },
  card: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
    alignSelf: "flex-start",
  },
  content: {
    flex: 1,
  },
  fileName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: spacing.xs + 1,
  },
  summary: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.sm + 2,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badge: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  timestamp: {
    color: colors.textMuted,
    fontSize: 11,
  },
});
