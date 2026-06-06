import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, ClarApp } from "@/src/api/client";
import { useSubscription } from "@/src/subscription/context";
import { colors, spacing, radius } from "@/src/theme";

const PRICES = { "single-monthly": 4, "single-yearly": 30, "bundle-monthly": 6, "bundle-yearly": 50 } as const;

export default function Paywall() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { purchase } = useSubscription();
  const [app, setApp] = useState<ClarApp | null>(null);
  const [plan, setPlan] = useState<"single" | "bundle">("bundle");
  const [period, setPeriod] = useState<"monthly" | "yearly">("yearly");
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    api.listApps().then((apps) => setApp(apps.find((a) => a.slug === slug) ?? null));
  }, [slug]);

  const handleBuy = async () => {
    setBuying(true);
    try {
      await purchase(plan, period, plan === "single" ? slug : undefined);
      router.back();
    } finally {
      setBuying(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="paywall-screen">
      <Pressable testID="paywall-close" onPress={() => router.back()} style={styles.close}>
        <Ionicons name="close" size={24} color={colors.cream} />
      </Pressable>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>
          {app ? `${app.name} freischalten` : "Freischalten"}
        </Text>
        <Text style={styles.heroSub}>
          Wähle dein Abo. Jederzeit kündbar.
        </Text>
      </View>

      <View style={styles.options}>
        <Pressable
          testID="paywall-plan-single"
          onPress={() => setPlan("single")}
          style={[styles.opt, plan === "single" && styles.optActive]}
        >
          <Text style={[styles.optTitle, plan === "single" && { color: colors.cream }]}>Einzel</Text>
          <Text style={[styles.optDesc, plan === "single" && { color: colors.cream, opacity: 0.85 }]}>
            Nur diese App
          </Text>
          <Text style={[styles.optPrice, plan === "single" && { color: colors.cream }]}>
            CHF {PRICES[`single-${period}`]}/{period === "monthly" ? "Mt." : "Jahr"}
          </Text>
        </Pressable>
        <Pressable
          testID="paywall-plan-bundle"
          onPress={() => setPlan("bundle")}
          style={[styles.opt, plan === "bundle" && styles.optActive]}
        >
          <View style={styles.recBadge}><Text style={styles.recBadgeText}>Empf.</Text></View>
          <Text style={[styles.optTitle, plan === "bundle" && { color: colors.cream }]}>Bundle</Text>
          <Text style={[styles.optDesc, plan === "bundle" && { color: colors.cream, opacity: 0.85 }]}>
            Alle clar·Apps
          </Text>
          <Text style={[styles.optPrice, plan === "bundle" && { color: colors.cream }]}>
            CHF {PRICES[`bundle-${period}`]}/{period === "monthly" ? "Mt." : "Jahr"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.toggle}>
        <Pressable testID="paywall-monthly" onPress={() => setPeriod("monthly")} style={[styles.tb, period === "monthly" && styles.tbActive]}>
          <Text style={[styles.tbText, period === "monthly" && styles.tbTextActive]}>Monatlich</Text>
        </Pressable>
        <Pressable testID="paywall-yearly" onPress={() => setPeriod("yearly")} style={[styles.tb, period === "yearly" && styles.tbActive]}>
          <Text style={[styles.tbText, period === "yearly" && styles.tbTextActive]}>Jährlich · spare 37%</Text>
        </Pressable>
      </View>

      <Pressable testID="paywall-buy" style={[styles.cta, buying && { opacity: 0.5 }]} onPress={handleBuy} disabled={buying}>
        {buying ? <ActivityIndicator color={colors.brand} /> : (
          <Text style={styles.ctaText}>Abonnieren — CHF {PRICES[`${plan}-${period}`]}</Text>
        )}
      </Pressable>
      <Text style={styles.note}>MOCK Kauf · Im nativen iOS-Build via RevenueCat</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.brand, paddingHorizontal: spacing.lg },
  close: { width: 40, height: 40, alignItems: "flex-end", justifyContent: "center" },
  hero: { paddingVertical: spacing.lg, alignItems: "center" },
  heroTitle: { fontSize: 26, fontWeight: "700", color: colors.cream, textAlign: "center", letterSpacing: -0.3 },
  heroSub: { fontSize: 14, color: colors.cream, opacity: 0.8, marginTop: spacing.sm, textAlign: "center" },
  options: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  opt: { flex: 1, backgroundColor: colors.brandDark, borderRadius: radius.lg, padding: spacing.md, borderWidth: 2, borderColor: colors.brandDark },
  optActive: { backgroundColor: colors.brandLight, borderColor: colors.cream },
  optTitle: { fontSize: 18, fontWeight: "700", color: colors.cream },
  optDesc: { fontSize: 12, color: colors.cream, opacity: 0.7, marginTop: 4 },
  optPrice: { fontSize: 16, fontWeight: "700", color: colors.cream, marginTop: spacing.sm },
  recBadge: { position: "absolute", top: -8, right: 8, backgroundColor: colors.cream, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  recBadgeText: { fontSize: 9, fontWeight: "700", color: colors.brand },
  toggle: { flexDirection: "row", backgroundColor: colors.brandDark, borderRadius: radius.pill, padding: 4, marginTop: spacing.lg },
  tb: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: "center" },
  tbActive: { backgroundColor: colors.cream },
  tbText: { fontSize: 13, color: colors.cream, opacity: 0.8, fontWeight: "600" },
  tbTextActive: { color: colors.brand, opacity: 1, fontWeight: "700" },
  cta: { backgroundColor: colors.cream, paddingVertical: 16, borderRadius: radius.pill, alignItems: "center", marginTop: "auto", marginBottom: spacing.sm },
  ctaText: { color: colors.brand, fontSize: 16, fontWeight: "700" },
  note: { fontSize: 10, color: colors.cream, opacity: 0.55, textAlign: "center", marginBottom: spacing.sm },
});
