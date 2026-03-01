import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  View,
  Text,
  FlatList,
  SectionList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MemoryCard from "../components/MemoryCard";
import FadeIn from "../components/FadeIn";
import SkeletonCard from "../components/SkeletonCard";
import AmbientBackground from "../components/AmbientBackground";
import { api, MemoryItem } from "../services/api";
import {
  colors,
  spacing,
  radii,
  typography,
  getCategoryColor,
  getCategoryIcon,
} from "../constants/theme";

const CATEGORIES: Array<{ key: string; icon: string }> = [
  { key: "all", icon: "apps" },
  { key: "work", icon: "briefcase" },
  { key: "study", icon: "school" },
  { key: "personal", icon: "person" },
  { key: "medical", icon: "medical" },
  { key: "finance", icon: "card" },
];

interface CategorySection {
  category: string;
  data: MemoryItem[];
}

export default function MemoriesScreen() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grouped">("list");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set(),
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadMemories = useCallback(async () => {
    setError(null);
    try {
      const category =
        selectedCategory === "all" ? undefined : selectedCategory;
      const search = searchQuery.trim() || undefined;
      const res = await api.getMemories(category, search);
      setMemories(res.memories);
    } catch (err: any) {
      setError(err.message || "Could not load memories");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory, searchQuery]);

  useEffect(() => {
    setLoading(true);
    loadMemories();
  }, [loadMemories]);

  // Compute category counts from current memories
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of memories) {
      const cat = m.category || "other";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [memories]);

  // Build grouped sections for SectionList
  const sections = useMemo((): CategorySection[] => {
    const groups: Record<string, MemoryItem[]> = {};
    for (const m of memories) {
      const cat = m.category || "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(m);
    }
    return Object.entries(groups)
      .sort(([, a], [, b]) => b.length - a.length)
      .map(([category, data]) => ({ category, data }));
  }, [memories]);

  const handleSearchChange = (text: string) => {
    setSearchText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(text);
    }, 300);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadMemories();
  };

  const handleDeleteMemory = async (item: MemoryItem) => {
    if (!item.doc_id) return;
    try {
      await api.deleteMemory(item.doc_id);
      setMemories((prev) => prev.filter((m) => m.doc_id !== item.doc_id));
    } catch (err: any) {
      Alert.alert("Error", err.message || "Could not delete memory");
    }
  };

  const toggleSection = (category: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const renderSectionHeader = ({ section }: { section: CategorySection }) => {
    const catColor = getCategoryColor(section.category);
    const catIcon = getCategoryIcon(section.category);
    const isCollapsed = collapsedSections.has(section.category);

    return (
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => toggleSection(section.category)}
        activeOpacity={0.7}
        accessibilityLabel={`${section.category}, ${section.data.length} files, ${isCollapsed ? "collapsed" : "expanded"}`}
        accessibilityRole="button"
      >
        <View style={styles.sectionLeft}>
          <View
            style={[
              styles.sectionIconWrap,
              { backgroundColor: `${catColor}20` },
            ]}
          >
            <Ionicons name={catIcon as any} size={16} color={catColor} />
          </View>
          <Text style={styles.sectionTitle}>{section.category}</Text>
          <View
            style={[
              styles.sectionCountBadge,
              {
                backgroundColor: `${catColor}20`,
                borderColor: `${catColor}40`,
              },
            ]}
          >
            <Text style={[styles.sectionCountText, { color: catColor }]}>
              {section.data.length}
            </Text>
          </View>
        </View>
        <Ionicons
          name={isCollapsed ? "chevron-down" : "chevron-up"}
          size={16}
          color={colors.textMuted}
        />
      </TouchableOpacity>
    );
  };

  const renderSectionItem = ({
    item,
    index,
    section,
  }: {
    item: MemoryItem;
    index: number;
    section: CategorySection;
  }) => {
    if (collapsedSections.has(section.category)) return null;
    return (
      <FadeIn delay={index * 30}>
        <MemoryCard item={item} onDelete={handleDeleteMemory} />
      </FadeIn>
    );
  };

  return (
    <View style={styles.container}>
      <AmbientBackground intensity="soft" />
      {/* Search bar with view toggle */}
      <View style={styles.searchArea}>
        <View
          style={[
            styles.searchRow,
            searchFocused && styles.searchRowFocused,
            { flex: 1 },
          ]}
        >
          <Ionicons
            name="search"
            size={18}
            color={searchFocused ? colors.primary : colors.textMuted}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={handleSearchChange}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search memories..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search memories"
          />
          {searchText.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setSearchText("");
                setSearchQuery("");
              }}
              accessibilityLabel="Clear search"
            >
              <Ionicons
                name="close-circle"
                size={18}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.viewToggle}
          onPress={() =>
            setViewMode((v) => (v === "list" ? "grouped" : "list"))
          }
          activeOpacity={0.7}
          accessibilityLabel={`Switch to ${viewMode === "list" ? "grouped" : "list"} view`}
          accessibilityRole="button"
        >
          <Ionicons
            name={viewMode === "list" ? "layers-outline" : "list-outline"}
            size={20}
            color={viewMode === "grouped" ? colors.primary : colors.textMuted}
          />
        </TouchableOpacity>
      </View>

      {/* Category filter pills */}
      <View style={styles.filterRow}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.key}
            style={[
              styles.pill,
              selectedCategory === cat.key && styles.pillActive,
            ]}
            onPress={() => setSelectedCategory(cat.key)}
            activeOpacity={0.7}
            accessibilityLabel={`Filter by ${cat.key}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: selectedCategory === cat.key }}
          >
            <Ionicons
              name={cat.icon as any}
              size={13}
              color={
                selectedCategory === cat.key ? "#fff" : colors.textSecondary
              }
              style={{ marginRight: 4 }}
            />
            <Text
              style={[
                styles.pillText,
                selectedCategory === cat.key && styles.pillTextActive,
              ]}
            >
              {cat.key}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Category summary bar (when viewing "all") */}
      {selectedCategory === "all" &&
        !loading &&
        memories.length > 0 &&
        Object.keys(categoryCounts).length > 1 && (
          <View style={styles.summaryBar}>
            {Object.entries(categoryCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, count]) => {
                const catColor = getCategoryColor(cat);
                const catIcon = getCategoryIcon(cat);
                return (
                  <TouchableOpacity
                    key={cat}
                    style={styles.summaryItem}
                    onPress={() => setSelectedCategory(cat)}
                    activeOpacity={0.7}
                    accessibilityLabel={`${cat}: ${count} files`}
                  >
                    <View
                      style={[
                        styles.summaryIconWrap,
                        { backgroundColor: `${catColor}18` },
                      ]}
                    >
                      <Ionicons
                        name={catIcon as any}
                        size={14}
                        color={catColor}
                      />
                    </View>
                    <Text style={[styles.summaryCount, { color: catColor }]}>
                      {count}
                    </Text>
                  </TouchableOpacity>
                );
              })}
          </View>
        )}

      {/* Error banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning" size={18} color={colors.warning} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            onPress={loadMemories}
            activeOpacity={0.7}
            accessibilityLabel="Retry loading memories"
            accessibilityRole="button"
          >
            <Text style={styles.retryLink}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Loading skeletons */}
      {loading ? (
        <View style={styles.skeletonContainer}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      ) : memories.length === 0 && !error ? (
        <View style={styles.centered}>
          <Ionicons
            name="file-tray-outline"
            size={64}
            color={colors.textMuted}
          />
          <Text style={styles.emptyText}>No memories yet</Text>
          <Text style={styles.emptySubtext}>
            Go to Scan to ingest some files
          </Text>
        </View>
      ) : viewMode === "grouped" ? (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => `${item.file_path}-${index}`}
          renderSectionHeader={renderSectionHeader as any}
          renderItem={renderSectionItem as any}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      ) : (
        <FlatList
          data={memories}
          keyExtractor={(item, index) => `${item.file_path}-${index}`}
          renderItem={({ item, index }) => (
            <FadeIn delay={index * 50}>
              <MemoryCard item={item} onDelete={handleDeleteMemory} />
            </FadeIn>
          )}
          contentContainerStyle={styles.listContent}
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
  searchArea: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchRowFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.cardElevated,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    paddingVertical: spacing.md,
  },
  viewToggle: {
    width: 42,
    height: 42,
    borderRadius: radii.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 1,
    borderRadius: radii.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  pillTextActive: {
    color: "#fff",
  },
  // Category summary bar
  summaryBar: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
    justifyContent: "center",
  },
  summaryItem: {
    alignItems: "center",
    gap: 3,
  },
  summaryIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
  },
  summaryCount: {
    fontSize: 11,
    fontWeight: "800",
  },
  // Section headers (grouped view)
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.cardElevated,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sectionIconWrap: {
    width: 30,
    height: 30,
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  sectionCountBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
  },
  sectionCountText: {
    fontSize: 11,
    fontWeight: "800",
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  skeletonContainer: {
    padding: spacing.lg,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xxxl,
  },
  emptyText: {
    color: colors.textSecondary,
    ...typography.heading,
    marginTop: spacing.lg,
  },
  emptySubtext: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
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
