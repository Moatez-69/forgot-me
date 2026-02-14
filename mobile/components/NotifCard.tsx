import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { NotificationEvent } from '../services/api';

interface Props {
  event: NotificationEvent;
}

export default function NotifCard({ event }: Props) {
  const urgency = getUrgency(event.date);

  return (
    <View style={[styles.card, { borderLeftColor: urgency.color }]}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {event.title}
        </Text>
        {urgency.label && (
          <View style={[styles.urgencyBadge, { backgroundColor: urgency.color }]}>
            <Text style={styles.urgencyText}>{urgency.label}</Text>
          </View>
        )}
      </View>

      {event.date && (
        <Text style={styles.date}>{formatDate(event.date)}</Text>
      )}

      <Text style={styles.description} numberOfLines={2}>
        {event.description}
      </Text>

      <Text style={styles.source}>
        From: {event.source_file}
      </Text>
    </View>
  );
}

interface Urgency {
  color: string;
  label: string;
}

function getUrgency(dateStr: string | null): Urgency {
  if (!dateStr) return { color: '#444', label: '' };

  try {
    const eventDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    if (eventDate < tomorrow) return { color: '#e74c3c', label: 'Today' };
    if (eventDate < new Date(tomorrow.getTime() + 86400000)) return { color: '#f39c12', label: 'Tomorrow' };
    if (eventDate < nextWeek) return { color: '#f1c40f', label: 'This week' };
    return { color: '#444', label: '' };
  } catch {
    return { color: '#444', label: '' };
  }
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#2d2d44',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    color: '#e0e0e0',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  urgencyBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginLeft: 8,
  },
  urgencyText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  date: {
    color: '#6c63ff',
    fontSize: 13,
    marginBottom: 6,
  },
  description: {
    color: '#a0a0b0',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
  },
  source: {
    color: '#555',
    fontSize: 11,
  },
});
