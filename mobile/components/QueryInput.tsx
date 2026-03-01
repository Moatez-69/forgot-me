import React, { useEffect, useRef, useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radii } from "../constants/theme";

interface Props {
  onSubmit: (question: string) => void;
  loading?: boolean;
}

export default function QueryInput({ onSubmit, loading }: Props) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  const glow = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(glow, {
      toValue: focused ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [focused, glow]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    onSubmit(trimmed);
    setText("");
  };

  const animatedBorder = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          borderColor: colors.border,
          shadowColor: colors.primary,
          shadowOpacity: animatedBorder,
        },
      ]}
    >
      <TextInput
        style={styles.input}
        placeholder="Ask anything about your files..."
        placeholderTextColor={colors.textMuted}
        value={text}
        onChangeText={setText}
        onSubmitEditing={handleSubmit}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
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
        activeOpacity={0.9}
        onPressIn={() => {
          Animated.spring(pressScale, {
            toValue: 0.95,
            useNativeDriver: true,
            speed: 30,
            bounciness: 6,
          }).start();
        }}
        onPressOut={() => {
          Animated.spring(pressScale, {
            toValue: 1,
            useNativeDriver: true,
            speed: 24,
            bounciness: 5,
          }).start();
        }}
        accessibilityLabel="Submit search"
        accessibilityRole="button"
      >
        <Animated.View style={{ transform: [{ scale: pressScale }] }}>
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          )}
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.cardElevated,
    borderRadius: radii.xl + 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 14,
    elevation: 2,
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
