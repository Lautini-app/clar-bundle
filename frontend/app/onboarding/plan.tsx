import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, ClarApp } from "@/src/api/client";
import { useAuth } from "@/src/auth/context";
import { useSubscription } from "@/src/subscription/context";
import { colors, spacing, radius } from "@/src/theme";

type PlanKey = "single" | "bundle";
type Period = "monthly" | "yearly";

const PRICES: Record<string, number> = {
  "single-monthly": 4,
  "single-yearly": 30,
  "bundle-monthly": 6,
  "bundle-yearly": 50,
};

export default function Plan() {
  const router = useRouter();
  const { user } = useAuth();
  const { purchase } = useSubscription();
  const [apps, setApps] = useState<ClarApp[]>([]);
  const selected = user?.selected_apps ?? [];
  const defaultPlan: PlanKey = selected.length > 1 ? "bundle" : "single";
  const [plan, setPlan] = useState<PlanKey>(defaultPlan);
  const [period, setPeriod] = useState<Period>("yearly");
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    api.listApps().then(setApps).catch(() => {});
  }, []);

  const singleApp = apps.find((a) => a.slug === selected[0]);
  const price = PRICES[`${plan}-${period}`];

  const handlePurchase = async () => {
    setBuying(true);
    try {
      await purchase(plan, period, plan === "single" ? selected[0] : undefined);
      router.replace("/(main)");
    } catch (e) {
      console.error(e);
    } finally {
      setBuying(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="plan-screen">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Dein Abo</Text>
        <Text style={styles.sub}>Wähle, was zu dir passt. Jederzeit kündbar.</Text>

        <View style={styles.toggle}>
          <Pressable
            testID="period-monthly"
            style={[styles.toggleBtn, period === "monthly" && styles.toggleBtnActive]}
            onPress={() => setPeriod("monthly")}
          >
            <Text style={[styles.toggleText, period === "monthly" && styles.toggleTextActive]}>Monatlich</Text>
          </Pressable>
          <Pressable
            testID="period-yearly"
            style={[styles.toggleBtn, period === "yearly" && styles.toggleBtnActive]}
            onPress={() => setPeriod("yearly")}
          >
            <Text style={[styles.toggleText, period === "yearly" && styles.toggleTextActive]}>Jährlich</Text>
            <View style={styles.savePill}>
              <Text style={styles.savePillText}>−37%</Text>
            </View>
          </Pressable>
        </View>

        <Pressable
          testID="plan-single"
          onPress={() => setPlan("single")}
          style={[styles.planCard, plan === "single" && styles.planCardActive]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.planName}>Einzel</Text>
            <Text style={styles.planDesc}>
              Eine App deiner Wahl{singleApp ? ` — ${singleApp.name}` : ""}
            </Text>
            <Text style={styles.planPrice}>
              CHF {PRICES[`single-${period}`]}
              <Text style={styles.planPeriod}>/{period === "monthly" ? "Monat" : "Jahr"}</Text>
            </Text>
          </View>
          <View style={[styles.radio, plan === "single" && styles.radioActive]}>
            {plan === "single" && <View style={styles.radioDot} />}
          </View>
        </Pressable>

        <Pressable
          testID="plan-bundle"
          onPress={() => setPlan("bundle")}
          style={[styles.planCard, plan === "bundle" && styles.planCardActive, styles.bundleCard]}
        >
          <View style={styles.recBadge}>
            <Text style={styles.recBadgeText}>Empfohlen</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.planName}>Bundle</Text>
            <Text style={styles.planDesc}>Alle aktuellen & zukünftigen clar·Apps</Text>
            <Text style={styles.planPrice}>
              CHF {PRICES[`bundle-${period}`]}
              <Text style={styles.planPeriod}>/{period === "monthly" ? "Monat" : "Jahr"}</Text>
            </Text>
            <View style={styles.features}>
              {["clar·heim", "clar·markt", "Zukünftige Apps inklusive"].map((f) => (
                <View key={f} style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={[styles.radio, plan === "bundle" && styles.radioActive]}>
            {plan === "bundle" && <View style={styles.radioDot} />}
          </View>
        </Pressable>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          testID="purchase-button"
          style={[styles.primary, buying && { opacity: 0.5 }]}
          disabled={buying}
          onPress={handlePurchase}
        >
          {buying ? (
            <ActivityIndicator color={colors.cream} />
          ) : (
            <Text style={styles.primaryText}>Abonnieren — CHF {price}</Text>
          )}
        </Pressable>
        <Text style={styles.disclaimer}>
          MOCK Kauf für Vorschau. Im nativen iOS-Build via RevenueCat / Apple In-App Purchase.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: spacing.lg },
  scroll: { paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },
  title: { fontSize: 26, fontWeight: "700", color: colors.ink, letterSpacing: -0.4 },
  sub: { fontSize: 14, color: colors.inkSoft },
  toggle: {
    flexDirection: "row",
    backgroundColor: colors.divider + "55",
    borderRadius: radius.pill,
    padding: 4,
    marginTop: spacing.sm,
  },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 },
  toggleBtnActive: { backgroundColor: colors.card },
  toggleText: { fontSize: 14, color: colors.inkSoft, fontWeight: "600" },
  toggleTextActive: { color: colors.ink },
  savePill: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  savePillText: { color: colors.cream, fontSize: 10, fontWeight: "700" },
  planCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.divider,
    gap: spacing.md,
  },
  planCardActive: { borderColor: colors.brand, backgroundColor: "#F2F6F3" },
  bundleCard: {},
  planName: { fontSize: 18, fontWeight: "700", color: colors.ink },
  planDesc: { fontSize: 13, color: colors.inkSoft, marginTop: 2 },
  planPrice: { fontSize: 22, fontWeight: "700", color: colors.brand, marginTop: spacing.sm },
  planPeriod: { fontSize: 14, fontWeight: "500", color: colors.inkSoft },
  features: { marginTop: spacing.sm, gap: 6 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  featureText: { fontSize: 13, color: colors.inkSoft },
  recBadge: {
    position: "absolute", top: -10, right: spacing.md,
    backgroundColor: colors.brand, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  recBadgeText: { color: colors.cream, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    borderColor: colors.divider, alignItems: "center", justifyContent: "center", marginTop: 4,
  },
  radioActive: { borderColor: colors.brand },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
  footer: { paddingBottom: spacing.sm, gap: spacing.sm },
  primary: { backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.pill, alignItems: "center" },
  primaryText: { color: colors.cream, fontSize: 16, fontWeight: "700" },
  disclaimer: { fontSize: 10, color: colors.inkMuted, textAlign: "center" },
});
