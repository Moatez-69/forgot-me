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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setBackendUrl, getBackendUrl, api } from "../services/api";

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
    // Always re-verify on app start
    (async () => {
      const savedUrl = await getBackendUrl();
      setUrl(savedUrl);
      const done = await AsyncStorage.getItem(SETUP_DONE_KEY);
      if (done === "true") {
        // Quick verify the saved URL still works
        try {
          await api.health();
          setSetupDone(true);
        } catch {
          // Connection failed — force setup screen
          setSetupDone(false);
        }
      }
      setLoaded(true);
    })();
  }, []);

  // Allow other screens to go back to setup
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
          placeholderTextColor="#666"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <TouchableOpacity
          style={setupStyles.testButton}
          onPress={handleTest}
          disabled={testing}
        >
          {testing ? (
            <ActivityIndicator color="#6c63ff" size="small" />
          ) : (
            <Text style={setupStyles.testButtonText}>Test Connection</Text>
          )}
        </TouchableOpacity>

        {status === "connected" && (
          <Text style={[setupStyles.status, { color: "#2ecc71" }]}>
            Connected - All services healthy
          </Text>
        )}
        {status === "degraded" && (
          <Text style={[setupStyles.status, { color: "#f39c12" }]}>
            Connected - Some services degraded
          </Text>
        )}
        {status === "error" && (
          <Text style={[setupStyles.status, { color: "#e74c3c" }]}>
            Cannot reach backend. Check the IP and port.
          </Text>
        )}

        <TouchableOpacity
          style={[
            setupStyles.button,
            (!status || status === "error") && setupStyles.buttonDisabled,
          ]}
          onPress={handleConnect}
          disabled={!status || status === "error"}
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
          headerStyle: { backgroundColor: "#0f0f1a" },
          headerTintColor: "#e0e0e0",
          tabBarStyle: {
            backgroundColor: "#0f0f1a",
            borderTopColor: "#1a1a2e",
          },
          tabBarActiveTintColor: "#6c63ff",
          tabBarInactiveTintColor: "#666",
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: "MindVault", tabBarLabel: "Home" }}
        />
        <Tabs.Screen
          name="scan"
          options={{ title: "Scan Files", tabBarLabel: "Scan" }}
        />
        <Tabs.Screen
          name="memories"
          options={{ title: "Memories", tabBarLabel: "Memories" }}
        />
        <Tabs.Screen
          name="notifications"
          options={{ title: "Events", tabBarLabel: "Events" }}
        />
      </Tabs>
    </>
  );
}

const setupStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  logo: { fontSize: 36, fontWeight: "800", color: "#6c63ff", marginBottom: 8 },
  subtitle: { fontSize: 16, color: "#a0a0b0", marginBottom: 32 },
  input: {
    width: "100%",
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#e0e0e0",
    borderWidth: 1,
    borderColor: "#2d2d44",
    marginBottom: 16,
  },
  testButton: {
    borderWidth: 1,
    borderColor: "#6c63ff",
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 12,
    marginBottom: 12,
  },
  testButtonText: { color: "#6c63ff", fontSize: 15, fontWeight: "600" },
  status: { fontSize: 14, marginBottom: 20, textAlign: "center" },
  button: {
    backgroundColor: "#6c63ff",
    borderRadius: 12,
    paddingHorizontal: 48,
    paddingVertical: 14,
  },
  buttonDisabled: { opacity: 0.3 },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
