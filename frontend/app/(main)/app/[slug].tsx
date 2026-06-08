import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, ClarApp } from "@/src/api/client";
import { useSubscription } from "@/src/subscription/context";
import { colors, spacing, radius } from "@/src/theme";
import { diag } from "@/src/lib/diagnostics";

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
 * Per-app route signatures: fallback for older web builds that don't yet
 * implement the `clar_ready` postMessage handshake. When the WebView's
 * current URL contains ANY of these path fragments AND loading finished,
 * we know the web app has finished its landing → in-app redirect and we
 * can drop the brand overlay.
 *
 * If neither the postMessage nor any of these match within the safety
 * timeout, we drop the overlay anyway so the user is never stuck.
 */
const APP_ROUTE_HINTS: Record<string, string[]> = {
  heim: ["/heute", "/app", "/dashboard", "/today"],
  markt: ["/app", "/liste", "/list", "/dashboard"],
};
const OVERLAY_MAX_MS = 6000; // worst-case fallback (web app does nothing)
const OVERLAY_HIDE_DELAY_MS = 120; // tiny delay after handshake/hint to let paint settle

/**
 * Injected into the WebView BEFORE the page's own scripts run.
 *
 * - Marks window.__CLAR_EMBEDDED__ + data-attribute + sessionStorage so the
 *   web app's `isEmbeddedInShell()` check returns true even on the very
 *   first render.
 * - Patches window.postMessage to also forward to ReactNativeWebView, so
 *   the web app can call BOTH `window.parent.postMessage` (old style)
 *   and `window.ReactNativeWebView.postMessage` (new style).
 * - Provides a tiny `window.clarShell.ready()` helper the web app can call
 *   the moment it has finished consuming the SSO session and routed away
 *   from any landing page.
 */
const EMBEDDED_INJECTED_JS = `
  (function() {
    try {
      window.__CLAR_EMBEDDED__ = true;
      window.__CLAR_SHELL_VERSION__ = '1.0.14';
      document.documentElement.setAttribute('data-clar-embedded', '1');
      try { sessionStorage.setItem('clar_embedded', '1'); } catch(e) {}

      var rn = window.ReactNativeWebView;
      function send(payload) {
        try {
          if (rn && typeof rn.postMessage === 'function') {
            rn.postMessage(typeof payload === 'string' ? payload : JSON.stringify(payload));
          }
        } catch (e) {}
      }

      window.clarShell = {
        ready: function() { send({ type: 'clar_ready' }); },
        post:  function(type, data) { send({ type: type, data: data || null }); },
      };

      // Bridge: web app may also call window.postMessage({type:'clar_ready'}, '*')
      var _origPost = window.postMessage && window.postMessage.bind(window);
      window.postMessage = function(msg, targetOrigin, transfer) {
        try { send(msg); } catch (e) {}
        if (_origPost) { try { return _origPost(msg, targetOrigin, transfer); } catch (e) {} }
      };
    } catch (e) {}
  })();
  true;
`;

type WebAppMessage =
  | { type: "clar_ready" }
  | { type: string; data?: unknown };

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
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyReceivedRef = useRef(false);
  const loadStartAtRef = useRef<number>(Date.now());

  const clearTimers = useCallback(() => {
    if (overlayTimer.current) { clearTimeout(overlayTimer.current); overlayTimer.current = null; }
    if (maxTimer.current)     { clearTimeout(maxTimer.current);     maxTimer.current     = null; }
  }, []);

  const hideOverlay = useCallback((reason: string) => {
    if (overlayTimer.current) { clearTimeout(overlayTimer.current); overlayTimer.current = null; }
    overlayTimer.current = setTimeout(() => {
      const elapsed = Date.now() - loadStartAtRef.current;
      diag.log(`[webview] overlay hide via ${reason} (${elapsed}ms)`);
      setWebLoading(false);
    }, OVERLAY_HIDE_DELAY_MS);
  }, []);

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
    return () => { clearTimers(); };
  }, [slug, clearTimers]);

  const embeddedUrl = useMemo(
    () => (app ? buildEmbeddedUrl(app.url, accessToken, refreshToken) : ""),
    [app, accessToken, refreshToken]
  );

  const onWebMessage = useCallback((e: WebViewMessageEvent) => {
    const raw = e?.nativeEvent?.data;
    if (!raw) return;
    let msg: WebAppMessage | null = null;
    try {
      msg = typeof raw === "string" ? JSON.parse(raw) : (raw as WebAppMessage);
    } catch {
      // not JSON — ignore non-handshake messages
      return;
    }
    if (msg && msg.type === "clar_ready") {
      readyReceivedRef.current = true;
      hideOverlay("clar_ready");
    }
  }, [hideOverlay]);

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
            SSO via Query-Param + Hash-Token. Overlay-Handshake: `clar_ready`.
          </Text>
        </View>
      ) : (
        <View style={{ flex: 1, backgroundColor: colors.brand }}>
          <WebView
            testID="webview-iframe"
            source={{ uri: embeddedUrl }}
            style={styles.webview}
            containerStyle={{ backgroundColor: colors.brand }}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            injectedJavaScriptBeforeContentLoaded={EMBEDDED_INJECTED_JS}
            applicationNameForUserAgent="clar-shell/1.0.14"
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
            onMessage={onWebMessage}
            onLoadStart={() => {
              loadStartAtRef.current = Date.now();
              readyReceivedRef.current = false;
              setWebLoading(true);
              clearTimers();
              // Hard ceiling: never trap the user behind our overlay.
              maxTimer.current = setTimeout(() => {
                if (!readyReceivedRef.current) {
                  diag.log("[webview] overlay hide via max-timeout");
                  setWebLoading(false);
                }
              }, OVERLAY_MAX_MS);
            }}
            onNavigationStateChange={(navState) => {
              // Fallback for web builds that don't yet emit `clar_ready`:
              // recognise an in-app route after loading finishes.
              if (readyReceivedRef.current) return;
              const hints = APP_ROUTE_HINTS[app.slug] ?? [];
              const url = navState.url ?? "";
              const path = (() => {
                try { return new URL(url).pathname; } catch { return url; }
              })();
              const inApp = hints.some((h) => path.includes(h));
              if (inApp && navState.loading === false) {
                hideOverlay("route-hint");
              }
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
  webview: { flex: 1, backgroundColor: colors.brand, opacity: 0.999 },
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
