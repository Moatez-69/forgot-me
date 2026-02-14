import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { colors, spacing, radii } from '../constants/theme';

export default function SkeletonCard() {
  const pulse = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[styles.card, { opacity: pulse }]}>
      <View style={styles.iconPlaceholder} />
      <View style={styles.content}>
        <View style={styles.titleBar} />
        <View style={styles.bodyBar} />
        <View style={styles.shortBar} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconPlaceholder: {
    width: 26,
    height: 26,
    borderRadius: radii.sm,
    backgroundColor: colors.border,
    marginRight: spacing.md,
  },
  content: {
    flex: 1,
  },
  titleBar: {
    height: 14,
    width: '60%',
    backgroundColor: colors.border,
    borderRadius: 4,
    marginBottom: spacing.sm,
  },
  bodyBar: {
    height: 10,
    width: '90%',
    backgroundColor: colors.border,
    borderRadius: 4,
    marginBottom: spacing.sm - 2,
  },
  shortBar: {
    height: 10,
    width: '40%',
    backgroundColor: colors.border,
    borderRadius: 4,
  },
});
