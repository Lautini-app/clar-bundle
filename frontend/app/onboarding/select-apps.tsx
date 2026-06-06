import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, ClarApp } from "@/src/api/client";
import { useAuth } from "@/src/auth/context";
import { colors, spacing, radius } from "@/src/theme";
import AppIcon from "@/src/components/AppIcon";

export default function SelectApps() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [apps, setApps] = useState<ClarApp[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(user?.selected_apps ?? []));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.listApps();
        setApps(list);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = (slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const onContinue = async () => {
    setSaving(true);
    try {
      await api.saveSelectedApps(Array.from(selected));
      await refresh();
      router.replace("/onboarding/plan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="select-apps-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Welche Apps{"\n"}möchtest du nutzen?</Text>
        <Text style={styles.sub}>Wähle alle, die dir passen. Du kannst später jederzeit erweitern.</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {apps.map((app) => {
            const isSel = selected.has(app.slug);
            const disabled = !app.available;
            return (
              <Pressable
                key={app.slug}
                testID={`app-card-${app.slug}`}
                disabled={disabled}
                onPress={() => toggle(app.slug)}
                style={[
                  styles.card,
                  isSel && { borderColor: colors.brand, backgroundColor: "#F2F6F3" },
                  disabled && { opacity: 0.55 },
                ]}
              >
                <AppIcon iconName={app.icon} color={app.color} size={56} locked={disabled} />
                <View style={styles.cardBody}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardTitle}>{app.name}</Text>
                    {disabled && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>bald</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.cardTagline}>{app.tagline}</Text>
                  <Text style={styles.cardDesc}>{app.description}</Text>
                </View>
                {!disabled && (
                  <View style={[styles.check, isSel && { backgroundColor: colors.brand, borderColor: colors.brand }]}>
                    {isSel && <Ionicons name="checkmark" size={16} color={colors.cream} />}
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.footer}>
        <Pressable
          testID="continue-to-plan-button"
          style={[styles.primary, (selected.size === 0 || saving) && { opacity: 0.45 }]}
          disabled={selected.size === 0 || saving}
          onPress={onContinue}
        >
          <Text style={styles.primaryText}>
            Weiter ({selected.size} {selected.size === 1 ? "App" : "Apps"})
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: spacing.lg },
  header: { paddingTop: spacing.md, paddingBottom: spacing.lg },
  title: { fontSize: 26, fontWeight: "700", color: colors.ink, letterSpacing: -0.4, lineHeight: 32 },
  sub: { fontSize: 14, color: colors.inkSoft, marginTop: spacing.sm, lineHeight: 20 },
  list: { gap: spacing.md, paddingBottom: spacing.lg },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.divider,
  },
  cardBody: { flex: 1 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.ink },
  cardTagline: { fontSize: 13, color: colors.inkSoft, marginTop: 2 },
  cardDesc: { fontSize: 12, color: colors.inkMuted, marginTop: 4, lineHeight: 16 },
  badge: { backgroundColor: colors.divider, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: "700", color: colors.inkSoft, letterSpacing: 0.5 },
  check: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.divider,
    alignItems: "center", justifyContent: "center",
  },
  footer: { paddingTop: spacing.sm, paddingBottom: spacing.sm },
  primary: { backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.pill, alignItems: "center" },
  primaryText: { color: colors.cream, fontSize: 16, fontWeight: "700" },
});
