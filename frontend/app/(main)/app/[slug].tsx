import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { api, ClarApp } from "@/src/api/client";
import { useSubscription } from "@/src/subscription/context";
import { colors, spacing } from "@/src/theme";

export default function AppWebView() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { hasEntitlement } = useSubscription();
  const [app, setApp] = useState<ClarApp | null>(null);
  const [ssoToken, setSsoToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const webRef = useRef<WebView | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const apps = await api.listApps();
        const found = apps.find((a) => a.slug === slug);
        setApp(found ?? null);
        if (found && hasEntitlement(found.slug)) {
          const t = await api.ssoToken().catch(() => null);
          if (t) setSsoToken(t.sso_token);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, hasEntitlement]);

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
      </SafeAreaView>
    );
  }

  if (!app) {
    return (
      <SafeAreaView style={styles.root}>
        <Text style={styles.error}>App nicht gefunden</Text>
      </SafeAreaView>
    );
  }

  const allowed = hasEntitlement(app.slug);

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID={`webview-${app.slug}`}>
      <View style={[styles.header, { borderBottomColor: app.color + "44" }]}>
        <Pressable testID="webview-back" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>{app.name}</Text>
        <View style={{ width: 32 }} />
      </View>

      {!allowed ? (
        <View style={styles.lockedBox}>
          <Ionicons name="lock-closed" size={32} color={colors.inkMuted} />
          <Text style={styles.lockedTitle}>Diese App ist gesperrt</Text>
          <Pressable
            testID="locked-upgrade-button"
            style={[styles.upgrade, { backgroundColor: app.color }]}
            onPress={() => router.replace({ pathname: "/paywall", params: { slug: app.slug } })}
          >
            <Text style={styles.upgradeText}>Jetzt freischalten</Text>
          </Pressable>
        </View>
      ) : Platform.OS === "web" ? (
        <View style={styles.webFallback}>
          <Ionicons name="globe-outline" size={36} color={colors.inkSoft} />
          <Text style={styles.webFallbackTitle}>{app.name}</Text>
          <Text style={styles.webFallbackUrl}>{app.url}</Text>
          <Text style={styles.webFallbackHint}>
            WebView-Vorschau auf dem nativen iOS-Build verfügbar.
          </Text>
        </View>
      ) : (
        <WebView
          ref={webRef}
          testID="webview-iframe"
          source={{ uri: app.url }}
          style={{ flex: 1 }}
          javaScriptEnabled
          domStorageEnabled
          onLoadEnd={() => {
            if (ssoToken && webRef.current) {
              // MOCK SSO HANDOFF: web apps would need to listen to this message
              webRef.current.postMessage(
                JSON.stringify({ type: "clar.sso", token: ssoToken })
              );
            }
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  back: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 17, fontWeight: "700", color: colors.ink },
  error: { textAlign: "center", marginTop: spacing.xl, color: colors.danger },
  lockedBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  lockedTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  upgrade: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 999 },
  upgradeText: { color: colors.cream, fontWeight: "700" },
  webFallback: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl },
  webFallbackTitle: { fontSize: 20, fontWeight: "700", color: colors.ink },
  webFallbackUrl: { fontSize: 13, color: colors.brand, fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }) },
  webFallbackHint: { fontSize: 12, color: colors.inkMuted, textAlign: "center", marginTop: spacing.md },
});
