import React, { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setBackendUrl, getBackendUrl, api } from "../services/api";
import { colors, spacing, radii, typography } from "../constants/theme";

const SETUP_DONE_KEY = "mindvault_setup_done";

// Export so other screens can trigger reconfiguration
export let showSetup: () => void = () => {};

export default function Layout() {
  const [setupDone, setSetupDone] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [url, setUrl] = useState("http://192.168.55.20:8000");
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const savedUrl = await getBackendUrl();
      setUrl(savedUrl);
      const done = await AsyncStorage.getItem(SETUP_DONE_KEY);
      if (done === "true") {
        try {
          await api.health();
          setSetupDone(true);
        } catch {
          setSetupDone(false);
        }
      }
      setLoaded(true);
    })();
  }, []);

  showSetup = () => {
    AsyncStorage.removeItem(SETUP_DONE_KEY);
    setSetupDone(false);
    setStatus(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setStatus(null);
    try {
      await setBackendUrl(url.trim());
      const res = await api.health();
      setStatus(res.status === "healthy" ? "connected" : "degraded");
    } catch {
      setStatus("error");
    } finally {
      setTesting(false);
    }
  };

  const handleConnect = async () => {
    await setBackendUrl(url.trim());
    await AsyncStorage.setItem(SETUP_DONE_KEY, "true");
    setSetupDone(true);
  };

  if (!loaded) return null;

  if (!setupDone) {
    return (
      <View style={setupStyles.container}>
        <StatusBar barStyle="light-content" />
        <Ionicons
          name="shield-checkmark"
          size={64}
          color={colors.primary}
          style={{ marginBottom: spacing.lg }}
        />
        <Text style={setupStyles.logo}>MindVault</Text>
        <Text style={setupStyles.subtitle}>Connect to your backend</Text>
        <TextInput
          style={setupStyles.input}
          value={url}
          onChangeText={(t) => {
            setUrl(t);
            setStatus(null);
          }}
          placeholder="http://192.168.x.x:8000"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          accessibilityLabel="Backend server URL"
          accessibilityHint="Enter the IP address and port of your MindVault backend"
        />

        <TouchableOpacity
          style={setupStyles.testButton}
          onPress={handleTest}
          disabled={testing}
          activeOpacity={0.7}
          accessibilityLabel="Test connection to backend"
          accessibilityRole="button"
        >
          {testing ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Text style={setupStyles.testButtonText}>Test Connection</Text>
          )}
        </TouchableOpacity>

        {status === "connected" && (
          <View style={setupStyles.statusRow}>
            <Ionicons
              name="checkmark-circle"
              size={18}
              color={colors.success}
            />
            <Text style={[setupStyles.status, { color: colors.success }]}>
              Connected - All services healthy
            </Text>
          </View>
        )}
        {status === "degraded" && (
          <View style={setupStyles.statusRow}>
            <Ionicons name="alert-circle" size={18} color={colors.warning} />
            <Text style={[setupStyles.status, { color: colors.warning }]}>
              Connected - Some services degraded
            </Text>
          </View>
        )}
        {status === "error" && (
          <View style={setupStyles.statusRow}>
            <Ionicons name="close-circle" size={18} color={colors.danger} />
            <Text style={[setupStyles.status, { color: colors.danger }]}>
              Cannot reach backend. Check the IP and port.
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            setupStyles.button,
            (!status || status === "error") && setupStyles.buttonDisabled,
          ]}
          onPress={handleConnect}
          disabled={!status || status === "error"}
          activeOpacity={0.7}
          accessibilityLabel="Continue to app"
          accessibilityRole="button"
        >
          <Text style={setupStyles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" />
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopColor: colors.card,
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "MindVault",
            tabBarLabel: "Home",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="scan"
          options={{
            title: "Scan Files",
            tabBarLabel: "Scan",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="scan" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="memories"
          options={{
            title: "Memories",
            tabBarLabel: "Memories",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="file-tray-full" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="notifications"
          options={{
            title: "Events",
            tabBarLabel: "Events",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="notifications" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}

const setupStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xxxl,
  },
  logo: {
    ...typography.hero,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: spacing.xxxl,
  },
  input: {
    width: "100%",
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    fontSize: 16,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  testButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.xxxl,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  testButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  status: {
    fontSize: 14,
    textAlign: "center",
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingHorizontal: 48,
    paddingVertical: spacing.xl - 6,
  },
  buttonDisabled: { opacity: 0.3 },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
