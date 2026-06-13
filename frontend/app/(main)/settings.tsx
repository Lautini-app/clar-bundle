import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from "react-native";
import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { useAuth } from "@/src/auth/context";
import { useSubscription } from "@/src/subscription/context";
import { colors, spacing, radius } from "@/src/theme";
import { clearWebViewSession } from "@/src/webview/session";
import { getDiagnostics, diag } from "../../src/lib/diagnostics";

export default function Settings() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { status, cancel, restore } = useSubscription();

  const handleSignOut = async () => {
    // 1. Clear shell session (auth context state + token)
    await signOut();
    // 2. Clear stored Supabase session tokens (used for SSO into WebViews)
    await AsyncStorage.multiRemove(["clar.supabase.access_token", "clar.supabase.refresh_token"]);
    // 3. Clear embedded WebView cookies so the next user doesn't land on
    //    a stale Supabase session inside clar·heim / clar·markt
    await clearWebViewSession();
    // 4. Bounce through the root index — its auth-aware splash routes to
    //    /onboarding/welcome now that the auth state is empty. Using "/"
    //    also unmounts the nested (main) stack cleanly so no stale screen
    //    flashes through.
    router.replace("/");
  };

  const handleCancel = async () => {
    await cancel();
  };

  const handleRestore = async () => {
    try {
      await restore();
    } catch (e) {
      if (__DEV__) console.warn("[clar] restore failed", e);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="settings-screen">
      <View style={styles.header}>
        <Pressable testID="settings-back" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Einstellungen</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.section}>Konto</Text>
        <View style={styles.card}>
          <Row label="Name" value={user?.full_name ?? "—"} />
          <Row label="E-Mail" value={user?.email ?? "—"} />
        </View>

        <Text style={styles.section}>Abo</Text>
        <View style={styles.card}>
          {status?.plan ? (
            <>
              <Row label="Plan" value={status.plan === "bundle" ? "Bundle" : "Einzel"} />
              <Row label="Zeitraum" value={status.billing_period ? (status.billing_period === "yearly" ? "Jährlich" : "Monatlich") : "—"} />
              <Row label="Preis" value={status.price_chf === null ? "—" : `CHF ${status.price_chf}`} />
              <Row label="Apps" value={status.apps_unlocked.length ? status.apps_unlocked.join(", ") : "—"} />
              <Pressable testID="cancel-subscription" onPress={handleCancel} style={styles.dangerBtn}>
                <Text style={styles.dangerText}>
                  {Platform.OS === "ios" ? "Abo verwalten in iOS-Einstellungen" : "Abo kündigen"}
                </Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.noPlan}>
              Kein aktives Abo. Wähle eine App auf der Startseite, um zu abonnieren.
            </Text>
          )}
        </View>

        {Platform.OS === "ios" && (
          <Pressable testID="restore-purchases" style={styles.linkRow} onPress={handleRestore}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Ionicons name="refresh-outline" size={18} color={colors.ink} />
              <Text style={styles.linkText}>Käufe wiederherstellen</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
          </Pressable>
        )}

        <Pressable testID="sign-out" style={styles.signOut} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={styles.signOutText}>Abmelden</Text>
        </Pressable>

        <Diagnostics />

        <Text style={styles.footer}>
          clar by lautini · v{Constants.expoConfig?.version ?? "—"}
          {Constants.expoConfig?.ios?.buildNumber ? ` (build ${Constants.expoConfig.ios.buildNumber})` : ""}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function Diagnostics() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Array<{ label: string; value: string; ok: boolean }>>([]);
  const [logs, setLogs] = useState<Array<{ ts: number; msg: string }>>([]);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [authErr, setAuthErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [data, recent, lastErr] = await Promise.all([
      getDiagnostics(),
      Promise.resolve(diag.recent()),
      AsyncStorage.getItem("clar.lastAuthError").catch(() => null),
    ]);
    setItems(data);
    setLogs(recent.slice().reverse()); // newest first
    setAuthErr(lastErr);
  }, []);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) await refresh();
  };

  const copyAll = async () => {
    const header = items.map((it) => `${it.ok ? "✓" : "✗"} ${it.label}: ${it.value}`).join("\n");
    const body = logs.map((l) => `[${formatTs(l.ts)}] ${l.msg}`).join("\n");
    const errBlock = authErr ? `\n\nLast Auth Error\n---------------\n${authErr}` : "";
    const out = `clar Diagnose\n=============\n${header}\n\nLogs\n----\n${body || "(keine Einträge)"}${errBlock}`;
    try {
      await Clipboard.setStringAsync(out);
      setCopyHint("In Zwischenablage kopiert ✓");
    } catch {
      setCopyHint("Kopieren fehlgeschlagen");
    }
    setTimeout(() => setCopyHint(null), 1800);
  };

  return (
    <View style={styles.diagWrap}>
      <Pressable testID="diagnostics-toggle" onPress={toggle} style={styles.diagHeader}>
        <Text style={styles.diagHeaderText}>Diagnose</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.inkSoft} />
      </Pressable>
      {open && (
        <View testID="diagnostics-list" style={styles.diagBody}>
          {items.map((it) => (
            <View key={it.label} style={styles.diagRow}>
              <View style={styles.diagDot(it.ok)} />
              <Text style={styles.diagLabel}>{it.label}</Text>
              <Text style={styles.diagValue}>{it.value}</Text>
            </View>
          ))}
          <Text style={styles.diagHint}>
            Erwartet im TestFlight nach Kauf: RevenueCat aktiv = ja, und
            mindestens eines der drei Entitlements (heim / markt / clar.app)
            sollte "aktiv" zeigen.
          </Text>

          <View style={styles.diagLogsHeader}>
            <Text style={styles.diagLogsTitle}>Runtime-Logs ({logs.length})</Text>
            <View style={styles.diagActions}>
              <Pressable testID="diagnostics-refresh" onPress={refresh} style={styles.diagBtn} hitSlop={6}>
                <Ionicons name="refresh" size={14} color={colors.inkSoft} />
              </Pressable>
              <Pressable testID="diagnostics-copy" onPress={copyAll} style={styles.diagBtn} hitSlop={6}>
                <Ionicons name="copy-outline" size={14} color={colors.inkSoft} />
                <Text style={styles.diagBtnText}>Kopieren</Text>
              </Pressable>
            </View>
          </View>

          {logs.length === 0 ? (
            <Text style={styles.diagLogsEmpty}>
              Noch keine Logs. Öffne eine App-Kachel — die WebView-Overlay-Logik
              schreibt hierher z. B. "overlay hide via clar_ready (340ms)".
            </Text>
          ) : (
            <ScrollView
              style={styles.diagLogsBox}
              contentContainerStyle={{ padding: spacing.sm }}
              showsVerticalScrollIndicator
              nestedScrollEnabled
            >
              {logs.map((l, idx) => (
                <Text key={`${l.ts}-${idx}`} style={styles.diagLogLine} selectable>
                  <Text style={styles.diagLogTs}>{formatTs(l.ts)}  </Text>
                  {l.msg}
                </Text>
              ))}
            </ScrollView>
          )}

          {copyHint && <Text style={styles.diagCopyHint}>{copyHint}</Text>}

          {authErr && (
            <View style={{ marginTop: spacing.md, padding: spacing.sm, backgroundColor: "#FFE9E9", borderRadius: radius.md, borderWidth: 1, borderColor: "#FFB7B7" }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: "#A21F1F", marginBottom: 4 }}>LETZTER AUTH-FEHLER (Apple Sign-In)</Text>
              <Text selectable style={{ fontSize: 10, color: "#5A0F0F", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", lineHeight: 13 }}>
                {authErr}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: spacing.sm, paddingBottom: spacing.md },
  back: { width: 40, height: 40, alignItems: "flex-start", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "700", color: colors.ink },
  scroll: { gap: spacing.sm, paddingBottom: spacing.xl },
  section: { fontSize: 12, fontWeight: "700", color: colors.inkSoft, marginTop: spacing.md, letterSpacing: 0.5, textTransform: "uppercase" },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.divider, gap: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  rowLabel: { fontSize: 14, color: colors.inkSoft },
  rowValue: { fontSize: 14, color: colors.ink, fontWeight: "600", maxWidth: "60%", textAlign: "right" },
  noPlan: { fontSize: 13, color: colors.inkSoft, lineHeight: 19 },
  linkRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.divider, marginTop: spacing.sm },
  linkText: { fontSize: 14, color: colors.ink, fontWeight: "600" },
  dangerBtn: { paddingVertical: 12, borderRadius: radius.pill, alignItems: "center", marginTop: spacing.sm, borderWidth: 1, borderColor: colors.danger },
  dangerText: { color: colors.danger, fontWeight: "700" },
  signOut: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, marginTop: spacing.lg },
  signOutText: { color: colors.danger, fontWeight: "700" },
  diagWrap: { marginTop: spacing.lg, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.divider, overflow: "hidden" },
  diagHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  diagHeaderText: { fontSize: 12, fontWeight: "700", color: colors.inkSoft, letterSpacing: 0.5, textTransform: "uppercase" },
  diagBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm, gap: 6 },
  diagRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  diagDot: (ok: boolean) => ({
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: ok ? colors.success : colors.danger,
  }),
  diagLabel: { fontSize: 12, color: colors.inkSoft, flex: 1 },
  diagValue: { fontSize: 12, color: colors.ink, fontWeight: "600", maxWidth: "55%", textAlign: "right" },
  diagHint: { fontSize: 10, color: colors.inkMuted, marginTop: spacing.sm, lineHeight: 14 },
  diagLogsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  diagLogsTitle: { fontSize: 11, fontWeight: "700", color: colors.inkSoft, letterSpacing: 0.4, textTransform: "uppercase" },
  diagActions: { flexDirection: "row", gap: 6 },
  diagBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.divider + "55",
  },
  diagBtnText: { fontSize: 11, color: colors.inkSoft, fontWeight: "600" },
  diagLogsBox: {
    maxHeight: 180,
    marginTop: 6,
    backgroundColor: colors.paper,
    borderRadius: radius.md ?? 8,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  diagLogsEmpty: { fontSize: 10, color: colors.inkMuted, marginTop: 6, lineHeight: 14, fontStyle: "italic" },
  diagLogLine: {
    fontSize: 10,
    color: colors.ink,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    lineHeight: 14,
  },
  diagLogTs: { color: colors.inkMuted },
  diagCopyHint: { fontSize: 10, color: colors.success, marginTop: 6, textAlign: "right" },
  footer: { textAlign: "center", color: colors.inkMuted, fontSize: 11, marginTop: spacing.md },
});
