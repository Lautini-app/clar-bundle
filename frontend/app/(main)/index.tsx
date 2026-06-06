import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, ClarApp } from "@/src/api/client";
import { useAuth } from "@/src/auth/context";
import { useSubscription } from "@/src/subscription/context";
import { colors, spacing, radius } from "@/src/theme";
import AppIcon from "@/src/components/AppIcon";

export default function MainHome() {
  const router = useRouter();
  const { user } = useAuth();
  const { status, hasEntitlement, hasBundle } = useSubscription();
  const [apps, setApps] = useState<ClarApp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listApps().then((a) => { setApps(a); setLoading(false); });
  }, []);

  const selected = user?.selected_apps ?? [];
  const myApps = apps.filter((a) => selected.includes(a.slug));
  const discoverApps = apps.filter((a) => !selected.includes(a.slug));

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="main-home">
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.hello}>Hallo{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}</Text>
          <Text style={styles.title}>Deine clar·Apps</Text>
        </View>
        <Pressable testID="settings-icon" onPress={() => router.push("/(main)/settings")} style={styles.iconBtn}>
          <Ionicons name="settings-outline" size={22} color={colors.ink} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {status?.plan && (
            <View style={styles.planChip}>
              <Ionicons name="sparkles" size={14} color={colors.brand} />
              <Text style={styles.planChipText}>
                {hasBundle ? "Bundle aktiv" : "Einzel-Abo"} · {status.billing_period === "yearly" ? "jährlich" : "monatlich"}
              </Text>
            </View>
          )}

          <Text style={styles.section}>Meine Apps</Text>
          {myApps.length === 0 ? (
            <Text style={styles.empty}>Noch keine App gewählt.</Text>
          ) : (
            myApps.map((app) => {
              const unlocked = hasEntitlement(app.slug);
              return (
                <Pressable
                  key={app.slug}
                  testID={`app-tile-${app.slug}`}
                  style={styles.tile}
                  onPress={() => {
                    if (unlocked) router.push({ pathname: "/(main)/app/[slug]", params: { slug: app.slug } });
                    else router.push({ pathname: "/paywall", params: { slug: app.slug } });
                  }}
                >
                  <AppIcon iconName={app.icon} color={app.color} size={52} locked={!unlocked} />
                  <View style={styles.tileBody}>
                    <Text style={styles.tileName}>{app.name}</Text>
                    <Text style={styles.tileTagline}>{app.tagline}</Text>
                  </View>
                  {unlocked ? (
                    <Ionicons name="chevron-forward" size={20} color={colors.inkMuted} />
                  ) : (
                    <View style={styles.upBtn}>
                      <Text style={styles.upBtnText}>Freischalten</Text>
                    </View>
                  )}
                </Pressable>
              );
            })
          )}

          {discoverApps.length > 0 && (
            <>
              <Text style={styles.section}>Entdecken</Text>
              {discoverApps.map((app) => (
                <View key={app.slug} style={[styles.tile, !app.available && { opacity: 0.6 }]}>
                  <AppIcon iconName={app.icon} color={app.color} size={52} locked={!app.available} />
                  <View style={styles.tileBody}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={styles.tileName}>{app.name}</Text>
                      {!app.available && (
                        <View style={styles.soonBadge}><Text style={styles.soonText}>bald</Text></View>
                      )}
                    </View>
                    <Text style={styles.tileTagline}>{app.tagline}</Text>
                  </View>
                </View>
              ))}
            </>
          )}

          <View style={{ height: spacing.xxl }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: spacing.lg },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: spacing.sm, paddingBottom: spacing.md },
  hello: { fontSize: 13, color: colors.inkMuted, fontWeight: "500" },
  title: { fontSize: 26, fontWeight: "700", color: colors.ink, letterSpacing: -0.4 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.divider },
  scroll: { gap: spacing.sm, paddingBottom: spacing.lg },
  planChip: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: "#E9F0EB", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  planChipText: { fontSize: 12, color: colors.brand, fontWeight: "700" },
  section: { fontSize: 13, fontWeight: "700", color: colors.inkSoft, marginTop: spacing.md, marginBottom: spacing.xs, letterSpacing: 0.5, textTransform: "uppercase" },
  empty: { fontSize: 13, color: colors.inkMuted, fontStyle: "italic" },
  tile: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.divider },
  tileBody: { flex: 1 },
  tileName: { fontSize: 16, fontWeight: "700", color: colors.ink },
  tileTagline: { fontSize: 13, color: colors.inkSoft, marginTop: 2 },
  upBtn: { backgroundColor: colors.brand, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  upBtnText: { color: colors.cream, fontSize: 12, fontWeight: "700" },
  soonBadge: { backgroundColor: colors.divider, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
  soonText: { fontSize: 9, fontWeight: "700", color: colors.inkSoft },
});
