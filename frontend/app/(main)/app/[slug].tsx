import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, ClarApp } from "@/src/api/client";
import { useSubscription } from "@/src/subscription/context";
import { colors, spacing } from "@/src/theme";

const SUPABASE_ACCESS_KEY = "clar.supabase.access_token";
const SUPABASE_REFRESH_KEY = "clar.supabase.refresh_token";

/**
 * Builds the WebView URL for an embedded clar·app.
 *
 * Contract with the web apps (see SSO_CONTRACT.md):
 *   1. Query param  ?clar_embedded=1          → detectable on first server
 *      render, before any JS runs. Web app skips landing/marketing page
 *      and any Stripe/pricing UI immediately.
 *   2. Hash params  #access_token=…&refresh_token=…&type=clar_sso
 *      → tokens stay in the hash (never sent to server, never logged).
 *   3. window.__CLAR_EMBEDDED__ === true (set before content load).
 *
 * The web app's bootstrap must read the hash and call
 * supabase.auth.setSession() before clearing the URL.
 */
function buildEmbeddedUrl(baseUrl: string, accessToken: string | null, refreshToken: string | null): string {
  if (!baseUrl) return baseUrl;
  // Strip any existing hash so we can rebuild it cleanly with tokens.
  const [urlNoHash] = baseUrl.split("#");
  // Add the embedded marker as a query param (server-visible on first render).
  const qSep = urlNoHash.includes("?") ? "&" : "?";
  const withQuery = `${urlNoHash}${qSep}clar_embedded=1`;
  // Append SSO tokens via hash (never reaches the server).
  if (accessToken && refreshToken) {
    const hash = `clar_embedded=1&access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}&type=clar_sso`;
    return `${withQuery}#${hash}`;
  }
  return withQuery;
}

const EMBEDDED_INJECTED_JS = `
  (function() {
    window.__CLAR_EMBEDDED__ = true;
    window.__CLAR_SHELL_VERSION__ = '1.0.0';
    document.documentElement.setAttribute('data-clar-embedded', '1');
  })();
  true;
`;

export default function AppWebView() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { hasEntitlement } = useSubscription();
  const [app, setApp] = useState<ClarApp | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [apps, at, rt] = await Promise.all([
          api.listApps(),
          AsyncStorage.getItem(SUPABASE_ACCESS_KEY),
          AsyncStorage.getItem(SUPABASE_REFRESH_KEY),
        ]);
        setApp(apps.find((a) => a.slug === slug) ?? null);
        setAccessToken(at);
        setRefreshToken(rt);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const embeddedUrl = useMemo(
    () => (app ? buildEmbeddedUrl(app.url, accessToken, refreshToken) : ""),
    [app, accessToken, refreshToken]
  );

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
            Embedded WebView aktiv im nativen iOS-Build.{"\n"}
            SSO-Token via URL-Hash + `__CLAR_EMBEDDED__` Flag.
          </Text>
        </View>
      ) : (
        <WebView
          testID="webview-iframe"
          source={{ uri: embeddedUrl }}
          style={{ flex: 1 }}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          injectedJavaScriptBeforeContentLoaded={EMBEDDED_INJECTED_JS}
          applicationNameForUserAgent="clar-shell/1.0.0"
          allowsBackForwardNavigationGestures
          decelerationRate="normal"
          pullToRefreshEnabled
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
  webFallbackHint: { fontSize: 12, color: colors.inkMuted, textAlign: "center", marginTop: spacing.md, lineHeight: 18 },
});
