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
  ScrollView,
  Alert,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  setBackendUrl,
  getBackendUrl,
  api,
  WebhookResponse,
} from "../services/api";
import { colors, spacing, radii, typography } from "../constants/theme";

const logoImage = require("../assets/logo.png");
const SETUP_DONE_KEY = "mindvault_setup_done";

// Export so other screens can trigger reconfiguration
export let showSetup: () => void = () => {};

export default function Layout() {
  const [setupDone, setSetupDone] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [url, setUrl] = useState("http://192.168.55.20:8000");
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Webhook state
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhooks, setWebhooks] = useState<WebhookResponse[]>([]);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState<number | null>(null);
  const [webhookMsg, setWebhookMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

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

  // Load webhooks when setup screen is shown
  useEffect(() => {
    if (!setupDone && loaded && status === "connected") {
      loadWebhooks();
    }
  }, [setupDone, loaded, status]);

  const loadWebhooks = async () => {
    try {
      const res = await api.getWebhooks();
      setWebhooks(res.webhooks);
    } catch {
      // Backend may not support webhooks yet
    }
  };

  showSetup = () => {
    AsyncStorage.removeItem(SETUP_DONE_KEY);
    setSetupDone(false);
    setStatus(null);
    setWebhookMsg(null);
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

  const handleSaveWebhook = async () => {
    const trimmed = webhookUrl.trim();
    if (!trimmed) return;
    setSavingWebhook(true);
    setWebhookMsg(null);
    try {
      await api.addWebhook(trimmed);
      setWebhookUrl("");
      await loadWebhooks();
      setWebhookMsg({ type: "success", text: "Webhook saved" });
    } catch (err: any) {
      setWebhookMsg({
        type: "error",
        text: err.message || "Failed to save webhook",
      });
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleTestWebhook = async (id: number) => {
    setTestingWebhook(id);
    setWebhookMsg(null);
    try {
      await api.testWebhook(id);
      setWebhookMsg({ type: "success", text: "Test notification sent!" });
    } catch (err: any) {
      setWebhookMsg({
        type: "error",
        text: err.message || "Test failed",
      });
    } finally {
      setTestingWebhook(null);
    }
  };

  const handleDeleteWebhook = (id: number) => {
    Alert.alert("Remove Webhook", "Delete this webhook?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteWebhook(id);
            setWebhooks((prev) => prev.filter((w) => w.id !== id));
          } catch (err: any) {
            Alert.alert("Error", err.message || "Could not delete webhook");
          }
        },
      },
    ]);
  };

  if (!loaded) return null;

  if (!setupDone) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={setupStyles.container}
        keyboardShouldPersistTaps="handled"
      >
        <StatusBar barStyle="light-content" />

        {/* Logo section */}
        <View style={setupStyles.logoSection}>
          <Image
            source={logoImage}
            style={setupStyles.logoImage}
            resizeMode="contain"
          />
          <Text style={setupStyles.logo}>Forgot Me</Text>
          <Text style={setupStyles.subtitle}>Never forget what matters</Text>
        </View>

        {/* Section: Backend Connection */}
        <View style={setupStyles.section}>
          <View style={setupStyles.sectionHeader}>
            <Ionicons name="server-outline" size={16} color={colors.accent} />
            <Text style={setupStyles.sectionTitle}>Backend Connection</Text>
          </View>

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
            <View style={setupStyles.statusBadge}>
              <Ionicons
                name="checkmark-circle"
                size={16}
                color={colors.success}
              />
              <Text style={[setupStyles.statusText, { color: colors.success }]}>
                Connected — All services healthy
              </Text>
            </View>
          )}
          {status === "degraded" && (
            <View style={setupStyles.statusBadge}>
              <Ionicons name="alert-circle" size={16} color={colors.warning} />
              <Text style={[setupStyles.statusText, { color: colors.warning }]}>
                Connected — Some services degraded
              </Text>
            </View>
          )}
          {status === "error" && (
            <View style={setupStyles.statusBadge}>
              <Ionicons name="close-circle" size={16} color={colors.danger} />
              <Text style={[setupStyles.statusText, { color: colors.danger }]}>
                Cannot reach backend. Check the IP and port.
              </Text>
            </View>
          )}
        </View>

        {/* Section: Discord Webhook (only after connected) */}
        {(status === "connected" || status === "degraded") && (
          <View style={setupStyles.section}>
            <View style={setupStyles.sectionHeader}>
              <Ionicons
                name="notifications-outline"
                size={16}
                color={colors.accent}
              />
              <Text style={setupStyles.sectionTitle}>
                Discord Notifications
              </Text>
            </View>
            <Text style={setupStyles.sectionHint}>
              Add a Discord webhook URL to receive notifications when events are
              coming up.
            </Text>

            <View style={setupStyles.webhookInputRow}>
              <TextInput
                style={setupStyles.webhookInput}
                value={webhookUrl}
                onChangeText={setWebhookUrl}
                placeholder="https://discord.com/api/webhooks/..."
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Discord webhook URL"
              />
              <TouchableOpacity
                style={[
                  setupStyles.webhookSaveBtn,
                  !webhookUrl.trim() && { opacity: 0.4 },
                ]}
                onPress={handleSaveWebhook}
                disabled={!webhookUrl.trim() || savingWebhook}
                activeOpacity={0.7}
              >
                {savingWebhook ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="add" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            </View>

            {/* Webhook feedback message */}
            {webhookMsg && (
              <View
                style={[
                  setupStyles.webhookFeedback,
                  {
                    backgroundColor:
                      webhookMsg.type === "success"
                        ? `${colors.success}15`
                        : `${colors.danger}15`,
                    borderColor:
                      webhookMsg.type === "success"
                        ? `${colors.success}30`
                        : `${colors.danger}30`,
                  },
                ]}
              >
                <Ionicons
                  name={
                    webhookMsg.type === "success"
                      ? "checkmark-circle"
                      : "alert-circle"
                  }
                  size={14}
                  color={
                    webhookMsg.type === "success"
                      ? colors.success
                      : colors.danger
                  }
                />
                <Text
                  style={[
                    setupStyles.webhookFeedbackText,
                    {
                      color:
                        webhookMsg.type === "success"
                          ? colors.success
                          : colors.danger,
                    },
                  ]}
                >
                  {webhookMsg.text}
                </Text>
              </View>
            )}

            {/* Saved webhooks list */}
            {webhooks.map((wh) => (
              <View key={wh.id} style={setupStyles.webhookItem}>
                <View style={setupStyles.webhookItemLeft}>
                  <View style={setupStyles.webhookIconWrap}>
                    <Ionicons
                      name="logo-discord"
                      size={16}
                      color={colors.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={setupStyles.webhookLabel}>{wh.label}</Text>
                    <Text
                      style={setupStyles.webhookUrlPreview}
                      numberOfLines={1}
                    >
                      ...{wh.url.slice(-30)}
                    </Text>
                  </View>
                </View>
                <View style={setupStyles.webhookActions}>
                  <TouchableOpacity
                    onPress={() => handleTestWebhook(wh.id)}
                    disabled={testingWebhook === wh.id}
                    activeOpacity={0.7}
                    style={setupStyles.webhookActionBtn}
                  >
                    {testingWebhook === wh.id ? (
                      <ActivityIndicator color={colors.accent} size="small" />
                    ) : (
                      <Ionicons
                        name="paper-plane-outline"
                        size={16}
                        color={colors.accent}
                      />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteWebhook(wh.id)}
                    activeOpacity={0.7}
                    style={setupStyles.webhookActionBtn}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={16}
                      color={colors.danger}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Continue button */}
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

        <View style={{ height: 40 }} />
      </ScrollView>
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
            title: "Forgot Me",
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
        <Tabs.Screen
          name="connections"
          options={{
            title: "Connections",
            tabBarLabel: "Graph",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="git-network" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}

const setupStyles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    padding: spacing.xxl,
    paddingTop: 60,
  },
  logoSection: {
    alignItems: "center",
    marginBottom: spacing.xxxl,
  },
  logoImage: {
    width: 90,
    height: 90,
    marginBottom: spacing.md,
  },
  logo: {
    ...typography.hero,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  section: {
    width: "100%",
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: spacing.xl,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  sectionHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.lg,
  },
  input: {
    width: "100%",
    backgroundColor: colors.cardElevated,
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
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xxxl,
    paddingVertical: spacing.md,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  testButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.cardElevated,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
  },
  // Webhook styles
  webhookInputRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  webhookInput: {
    flex: 1,
    backgroundColor: colors.cardElevated,
    borderRadius: radii.lg,
    padding: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  webhookSaveBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    width: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  webhookFeedback: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  webhookFeedbackText: {
    fontSize: 13,
    fontWeight: "600",
  },
  webhookItem: {
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
  webhookItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: spacing.sm,
  },
  webhookIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: `${colors.primary}15`,
    justifyContent: "center",
    alignItems: "center",
  },
  webhookLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  webhookUrlPreview: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  webhookActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  webhookActionBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: 56,
    paddingVertical: spacing.lg,
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.3 },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
