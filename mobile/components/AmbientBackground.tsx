import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { colors } from "../constants/theme";

interface Props {
  intensity?: "soft" | "medium";
}

export default function AmbientBackground({ intensity = "soft" }: Props) {
  const driftA = useRef(new Animated.Value(0)).current;
  const driftB = useRef(new Animated.Value(0)).current;
  const driftC = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = (value: Animated.Value, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );

    const a = loop(driftA, 8500);
    const b = loop(driftB, 11000);
    const c = loop(driftC, 9500);

    a.start();
    b.start();
    c.start();

    return () => {
      a.stop();
      b.stop();
      c.stop();
    };
  }, [driftA, driftB, driftC]);

  const alpha = intensity === "medium" ? "40" : "24";

  return (
    <View pointerEvents="none" style={styles.container}>
      <Animated.View
        style={[
          styles.blob,
          styles.blobA,
          {
            backgroundColor: `${colors.primary}${alpha}`,
            transform: [
              { translateX: driftA.interpolate({ inputRange: [0, 1], outputRange: [-12, 22] }) },
              { translateY: driftA.interpolate({ inputRange: [0, 1], outputRange: [0, -20] }) },
              { scale: driftA.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] }) },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.blob,
          styles.blobB,
          {
            backgroundColor: `${colors.accent}${alpha}`,
            transform: [
              { translateX: driftB.interpolate({ inputRange: [0, 1], outputRange: [15, -16] }) },
              { translateY: driftB.interpolate({ inputRange: [0, 1], outputRange: [-8, 18] }) },
              { scale: driftB.interpolate({ inputRange: [0, 1], outputRange: [1.06, 0.94] }) },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.blob,
          styles.blobC,
          {
            backgroundColor: `${colors.info}${alpha}`,
            transform: [
              { translateX: driftC.interpolate({ inputRange: [0, 1], outputRange: [-18, 10] }) },
              { translateY: driftC.interpolate({ inputRange: [0, 1], outputRange: [12, -12] }) },
              { scale: driftC.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.08] }) },
            ],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  blob: {
    position: "absolute",
    borderRadius: 999,
  },
  blobA: {
    width: 240,
    height: 240,
    top: -110,
    left: -90,
  },
  blobB: {
    width: 260,
    height: 260,
    top: 120,
    right: -120,
  },
  blobC: {
    width: 220,
    height: 220,
    bottom: -90,
    left: 30,
  },
});
