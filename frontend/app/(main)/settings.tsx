import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth/context";
import { useSubscription } from "@/src/subscription/context";
import { colors, spacing, radius } from "@/src/theme";

export default function Settings() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { status, cancel } = useSubscription();

  const handleSignOut = async () => {
    await signOut();
    router.replace("/onboarding/welcome");
  };

  const handleCancel = async () => {
    await cancel();
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
          <Row label="Apple ID" value={user?.apple_user_id?.slice(0, 14) + "…"} />
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
                <Text style={styles.dangerText}>Abo kündigen (MOCK)</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              testID="upgrade-from-settings"
              onPress={() => router.push("/onboarding/plan")}
              style={styles.upgradeBtn}
            >
              <Text style={styles.upgradeBtnText}>Abo abschliessen</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.section}>Apps verwalten</Text>
        <Pressable
          testID="manage-apps"
          style={styles.linkRow}
          onPress={() => router.push("/onboarding/select-apps")}
        >
          <Text style={styles.linkText}>App-Auswahl ändern</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
        </Pressable>

        <Pressable testID="sign-out" style={styles.signOut} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={styles.signOutText}>Abmelden</Text>
        </Pressable>

        <Text style={styles.footer}>clar by lautini · v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
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
  linkRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.divider },
  linkText: { fontSize: 14, color: colors.ink, fontWeight: "600" },
  upgradeBtn: { backgroundColor: colors.brand, paddingVertical: 12, borderRadius: radius.pill, alignItems: "center", marginTop: spacing.xs },
  upgradeBtnText: { color: colors.cream, fontWeight: "700" },
  dangerBtn: { paddingVertical: 12, borderRadius: radius.pill, alignItems: "center", marginTop: spacing.sm, borderWidth: 1, borderColor: colors.danger },
  dangerText: { color: colors.danger, fontWeight: "700" },
  signOut: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, marginTop: spacing.lg },
  signOutText: { color: colors.danger, fontWeight: "700" },
  footer: { textAlign: "center", color: colors.inkMuted, fontSize: 11, marginTop: spacing.md },
});
