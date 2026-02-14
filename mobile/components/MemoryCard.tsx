import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { MemoryItem } from '../services/api';

const MODALITY_ICONS: Record<string, string> = {
  pdf: '📄',
  image: '🖼️',
  audio: '🎵',
  text: '📝',
  calendar: '📅',
  email: '✉️',
};

const CATEGORY_COLORS: Record<string, string> = {
  work: '#4a9eff',
  study: '#ff9f43',
  personal: '#54a0ff',
  medical: '#ee5a24',
  finance: '#2ecc71',
  other: '#a0a0a0',
};

interface Props {
  item: MemoryItem;
}

export default function MemoryCard({ item }: Props) {
  const icon = MODALITY_ICONS[item.modality] || '📁';
  const badgeColor = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.other;
  const timeAgo = formatTimeAgo(item.timestamp);

  return (
    <View style={styles.card}>
      <Text style={styles.icon}>{icon}</Text>
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

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return '';
  }
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2d2d44',
  },
  icon: {
    fontSize: 28,
    marginRight: 12,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  fileName: {
    color: '#e0e0e0',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  summary: {
    color: '#a0a0b0',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  timestamp: {
    color: '#666',
    fontSize: 11,
  },
});
