import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getAppBySlug } from "@/src/api/apps";
import { useSubscription } from "@/src/subscription/context";
import { isRevenueCatAvailable, isNativeBuild } from "@/src/lib/revenuecat";
import { colors, spacing, radius } from "@/src/theme";

const PRICES = {
  "single-monthly": 4,
  "single-yearly": 30,
  "bundle-monthly": 6,
  "bundle-yearly": 50,
} as const;

export default function Paywall() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { purchase } = useSubscription();
  const app = useMemo(() => getAppBySlug(slug), [slug]);
  const [plan, setPlan] = useState<"single" | "bundle">("bundle");
  const [period, setPeriod] = useState<"monthly" | "yearly">("yearly");
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Decide which note to show under the buy button:
  // - Real Apple IAP via RevenueCat available → official IAP disclosure
  // - Native build but RC not configured (rare) → setup hint
  // - Web / Expo Go → MOCK note
  const note = (() => {
    if (isRevenueCatAvailable()) {
      return "Wiederkehrendes Abo via Apple In-App-Purchase. Jederzeit in iOS-Einstellungen kündbar.";
    }
    if (isNativeBuild()) {
      return "RevenueCat nicht initialisiert — prüfe API Key + react-native-purchases Link.";
    }
    return "Vorschau-Modus · Echter Kauf nur im nativen iOS-Build (TestFlight).";
  })();

  const handleBuy = async () => {
    setError(null);
    setBuying(true);
    try {
      await purchase(plan, period, plan === "single" ? slug : undefined);
      if (slug) {
        router.replace({ pathname: "/(main)/app/[slug]", params: { slug } });
      } else {
        router.back();
      }
    } catch (e: any) {
      setError(e?.message ?? "Kauf fehlgeschlagen");
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
        <Text style={styles.heroSub}>Wähle dein Abo. Jederzeit kündbar.</Text>
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
          <View style={styles.recBadge}>
            <Text style={styles.recBadgeText}>Empf.</Text>
          </View>
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
        <Pressable
          testID="paywall-monthly"
          onPress={() => setPeriod("monthly")}
          style={[styles.tb, period === "monthly" && styles.tbActive]}
        >
          <Text style={[styles.tbText, period === "monthly" && styles.tbTextActive]}>Monatlich</Text>
        </Pressable>
        <Pressable
          testID="paywall-yearly"
          onPress={() => setPeriod("yearly")}
          style={[styles.tb, period === "yearly" && styles.tbActive]}
        >
          <Text style={[styles.tbText, period === "yearly" && styles.tbTextActive]}>
            Jährlich · spare 37%
          </Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBox} testID="paywall-error">
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Pressable
        testID="paywall-buy"
        style={[styles.cta, buying && { opacity: 0.5 }]}
        onPress={handleBuy}
        disabled={buying}
      >
        {buying ? (
          <ActivityIndicator color={colors.brand} />
        ) : (
          <Text style={styles.ctaText}>Abonnieren — CHF {PRICES[`${plan}-${period}`]}</Text>
        )}
      </Pressable>
      <Text style={styles.note}>{note}</Text>
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
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#3a1f1f", borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.md, borderWidth: 1, borderColor: colors.danger },
  errorText: { color: "#FFCDCD", fontSize: 12, flex: 1, lineHeight: 17 },
  cta: { backgroundColor: colors.cream, paddingVertical: 16, borderRadius: radius.pill, alignItems: "center", marginTop: "auto", marginBottom: spacing.sm },
  ctaText: { color: colors.brand, fontSize: 16, fontWeight: "700" },
  note: { fontSize: 10, color: colors.cream, opacity: 0.6, textAlign: "center", marginBottom: spacing.sm, paddingHorizontal: spacing.md, lineHeight: 14 },
});
