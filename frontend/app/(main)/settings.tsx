import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/src/auth/context";
import { useSubscription } from "@/src/subscription/context";
import { colors, spacing, radius } from "@/src/theme";
import { clearWebViewSession } from "@/src/webview/session";
import { getDiagnostics } from "@/src/lib/diagnostics";

export default function Settings() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { status, cancel, restore } = useSubscription();

  const handleSignOut = async () => {
    // 1. Clear shell session
    await signOut();
    // 2. Clear stored Supabase session tokens
    await AsyncStorage.multiRemove(["clar.supabase.access_token", "clar.supabase.refresh_token"]);
    // 3. Clear embedded WebView cookies (Supabase session in clar·apps)
    await clearWebViewSession();
    // 4. Navigate back to welcome
    router.replace("/onboarding/welcome");
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
              <Row label="Zeitraum" value={status.billing_period === "yearly" ? "Jährlich" : "Monatlich"} />
              <Row label="Preis" value={`CHF ${status.price_chf}`} />
              <Row label="Apps" value={status.apps_unlocked.join(", ")} />
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

        <Text style={styles.footer}>clar by lautini · v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Diagnostics() {
  const [open, setOpen] = useState(false);
  const items = open ? getDiagnostics() : [];
  return (
    <View style={styles.diagWrap}>
      <Pressable testID="diagnostics-toggle" onPress={() => setOpen((v) => !v)} style={styles.diagHeader}>
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
            Erwartet im TestFlight: alle grünen Punkte. Wenn "RevenueCat aktiv = nein"
            steht obwohl native iOS Build = ja → react-native-purchases nicht gelinkt
            oder API Key fehlt im Build.
          </Text>
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
  footer: { textAlign: "center", color: colors.inkMuted, fontSize: 11, marginTop: spacing.md },
});
