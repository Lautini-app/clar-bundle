import { useEffect, useMemo, useState, useRef } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, ClarApp } from "@/src/api/client";
import { useSubscription } from "@/src/subscription/context";
import { colors, spacing, radius } from "@/src/theme";

const SUPABASE_ACCESS_KEY = "clar.supabase.access_token";
const SUPABASE_REFRESH_KEY = "clar.supabase.refresh_token";

/**
 * Builds the WebView URL for an embedded clar·app.
 *
 * Contract with the web apps (see SSO_CONTRACT.md):
 *   1. Query param  ?clar_embedded=1   → server-visible on first render,
 *      web app skips landing/marketing immediately.
 *   2. Hash params  #access_token=…&refresh_token=…&type=clar_sso
 *      → tokens never reach the server, never get logged.
 *   3. window.__CLAR_EMBEDDED__ === true (set before content load).
 */
function buildEmbeddedUrl(baseUrl: string, accessToken: string | null, refreshToken: string | null): string {
  if (!baseUrl) return baseUrl;
  const [urlNoHash] = baseUrl.split("#");
  const qSep = urlNoHash.includes("?") ? "&" : "?";
  const withQuery = `${urlNoHash}${qSep}clar_embedded=1`;
  if (accessToken && refreshToken) {
    const hash = `clar_embedded=1&access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}&type=clar_sso`;
    return `${withQuery}#${hash}`;
  }
  return withQuery;
}

/**
 * Per-app route signatures: when the WebView's current URL contains ANY of
 * these path fragments, we know the web app has finished its
 * landing → in-app redirect and we can drop the brand overlay.
 *
 * If none of these match within the safety timeout, we drop the overlay
 * anyway so the user is never stuck staring at our overlay forever.
 */
const APP_ROUTE_HINTS: Record<string, string[]> = {
  heim: ["/heute", "/app", "/dashboard", "/today"],
  markt: ["/app", "/liste", "/list", "/dashboard"],
};
const OVERLAY_MAX_MS = 6000; // worst-case fallback (web app does no redirect)
const OVERLAY_HIDE_DELAY_MS = 200; // small delay after in-app detection
  (function() {
    window.__CLAR_EMBEDDED__ = true;
    window.__CLAR_SHELL_VERSION__ = '1.0.13';
    document.documentElement.setAttribute('data-clar-embedded', '1');
    try { sessionStorage.setItem('clar_embedded', '1'); } catch(e) {}
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
  const [webLoading, setWebLoading] = useState(true);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    return () => {
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
    };
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

  // Clean header: clearly the shell's chrome, not the web-app's nav.
  // - Left: tappable "Apps" pill (back to tiles)
  // - Center: app name
  // - Right: X close button (also back to tiles, for users who expect modal-style close)
  const Header = (
    <View style={[styles.header, { borderBottomColor: app.color + "44" }]}>
      <Pressable
        testID="webview-back"
        onPress={() => router.replace("/(main)")}
        style={({ pressed }) => [styles.backPill, pressed && { opacity: 0.6 }]}
        hitSlop={8}
      >
        <Ionicons name="chevron-back" size={18} color={colors.ink} />
        <Text style={styles.backPillText}>Apps</Text>
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>{app.name}</Text>
      <Pressable
        testID="webview-close"
        onPress={() => router.replace("/(main)")}
        style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
        hitSlop={8}
      >
        <Ionicons name="close" size={22} color={colors.ink} />
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID={`webview-${app.slug}`}>
      {Header}

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
            SSO via Query-Param + Hash-Token.
          </Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            testID="webview-iframe"
            source={{ uri: embeddedUrl }}
            style={{ flex: 1, backgroundColor: colors.brand }}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            injectedJavaScriptBeforeContentLoaded={EMBEDDED_INJECTED_JS}
            applicationNameForUserAgent="clar-shell/1.0.13"
            allowsBackForwardNavigationGestures
            decelerationRate="normal"
            pullToRefreshEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowFileAccess
            allowFileAccessFromFileURLs
            allowUniversalAccessFromFileURLs
            originWhitelist={["https://*", "http://*"]}
            onPermissionRequest={(event: any) => {
              try { event?.nativeEvent?.grant?.(event.nativeEvent.resources); } catch {}
            }}
            onLoadStart={() => setWebLoading(true)}
            onNavigationStateChange={(navState) => {
              // Keep the brand overlay until we see an in-app route. This
              // hides landing/marketing pages that the web app may briefly
              // render before its beforeLoad/redirect kicks in.
              const hints = APP_ROUTE_HINTS[app.slug] ?? [];
              const url = navState.url ?? "";
              const path = (() => {
                try { return new URL(url).pathname; } catch { return url; }
              })();
              const inApp = hints.some((h) => path.includes(h));
              if (inApp && navState.loading === false) {
                if (overlayTimer.current) clearTimeout(overlayTimer.current);
                overlayTimer.current = setTimeout(
                  () => setWebLoading(false),
                  OVERLAY_HIDE_DELAY_MS
                );
              }
            }}
            onLoadEnd={() => {
              // Safety net: never trap the user behind our overlay forever.
              // If the web app does NOT navigate to a recognised in-app route
              // within OVERLAY_MAX_MS, drop the overlay anyway.
              if (overlayTimer.current) clearTimeout(overlayTimer.current);
              overlayTimer.current = setTimeout(
                () => setWebLoading(false),
                OVERLAY_MAX_MS
              );
            }}
          />
          {webLoading && (
            <View style={styles.loadingOverlay} pointerEvents="none" testID="webview-loading-overlay">
              <Text style={styles.loadingBrand}>clar</Text>
              <Text style={styles.loadingTag}>{app.name} wird geladen…</Text>
              <ActivityIndicator color={colors.cream} style={{ marginTop: spacing.md }} />
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    backgroundColor: colors.paper,
  },
  backPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.divider + "66",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    gap: 2,
  },
  backPillText: { fontSize: 14, fontWeight: "700", color: colors.ink },
  title: { fontSize: 16, fontWeight: "700", color: colors.ink, flex: 1, textAlign: "center" },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: colors.divider + "66",
  },
  error: { textAlign: "center", marginTop: spacing.xl, color: colors.danger },
  lockedBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  lockedTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  upgrade: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 999 },
  upgradeText: { color: colors.cream, fontWeight: "700" },
  webFallback: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl },
  webFallbackTitle: { fontSize: 20, fontWeight: "700", color: colors.ink },
  webFallbackUrl: { fontSize: 13, color: colors.brand, fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }) },
  webFallbackHint: { fontSize: 12, color: colors.inkMuted, textAlign: "center", marginTop: spacing.md, lineHeight: 18 },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingBrand: { fontSize: 44, fontWeight: "700", color: colors.cream, letterSpacing: -1.5 },
  loadingTag: { fontSize: 14, color: colors.cream, opacity: 0.8, marginTop: spacing.sm },
});
