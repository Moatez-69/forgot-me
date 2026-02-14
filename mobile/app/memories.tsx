import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import MemoryCard from '../components/MemoryCard';
import { api, MemoryItem } from '../services/api';

const CATEGORIES = ['all', 'work', 'study', 'personal', 'medical', 'finance'];

export default function MemoriesScreen() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadMemories = useCallback(async () => {
    try {
      const category = selectedCategory === 'all' ? undefined : selectedCategory;
      const res = await api.getMemories(category);
      setMemories(res.memories);
    } catch {
      // Fail silently
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    setLoading(true);
    loadMemories();
  }, [loadMemories]);

  const onRefresh = () => {
    setRefreshing(true);
    loadMemories();
  };

  return (
    <View style={styles.container}>
      {/* Category filter pills */}
      <View style={styles.filterRow}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[
              styles.pill,
              selectedCategory === cat && styles.pillActive,
            ]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text
              style={[
                styles.pillText,
                selectedCategory === cat && styles.pillTextActive,
              ]}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Memory list */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#6c63ff" />
        </View>
      ) : memories.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No memories yet</Text>
          <Text style={styles.emptySubtext}>
            Go to Scan to ingest some files
          </Text>
        </View>
      ) : (
        <FlatList
          data={memories}
          keyExtractor={(item, index) => `${item.file_path}-${index}`}
          renderItem={({ item }) => <MemoryCard item={item} />}
          contentContainerStyle={styles.listContent}
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
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#2d2d44',
  },
  pillActive: {
    backgroundColor: '#6c63ff',
    borderColor: '#6c63ff',
  },
  pillText: {
    color: '#a0a0b0',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  pillTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
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
  },
});
