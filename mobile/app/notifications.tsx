import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import NotifCard from '../components/NotifCard';
import { api, NotificationEvent } from '../services/api';

export default function NotificationsScreen() {
  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadEvents = useCallback(async () => {
    try {
      const res = await api.getNotifications();
      setEvents(res.events);
    } catch {
      // Fail silently
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

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#6c63ff" />
        </View>
      ) : events.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No upcoming events</Text>
          <Text style={styles.emptySubtext}>
            Events will appear here when extracted from your files
          </Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <NotifCard event={item} />}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <Text style={styles.header}>
              {events.length} upcoming event{events.length !== 1 ? 's' : ''}
            </Text>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#6c63ff"
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
    backgroundColor: '#0f0f1a',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    color: '#a0a0b0',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#a0a0b0',
    fontSize: 18,
    fontWeight: '600',
  },
  emptySubtext: {
    color: '#555',
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
