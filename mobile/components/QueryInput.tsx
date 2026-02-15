import React, { useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Text,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radii } from "../constants/theme";

interface Props {
  onSubmit: (question: string) => void;
  loading?: boolean;
}

export default function QueryInput({ onSubmit, loading }: Props) {
  const [text, setText] = useState("");

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    onSubmit(trimmed);
    setText("");
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Ask anything about your files..."
        placeholderTextColor={colors.textMuted}
        value={text}
        onChangeText={setText}
        onSubmitEditing={handleSubmit}
        returnKeyType="search"
        editable={!loading}
        multiline={false}
        accessibilityLabel="Search your files"
        accessibilityHint="Type a question to search your memories"
      />
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading || !text.trim()}
        activeOpacity={0.7}
        accessibilityLabel="Submit search"
        accessibilityRole="button"
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radii.xl + 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    paddingVertical: spacing.md,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginLeft: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
