import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius } from "@/src/theme";
import Logo from "@/src/components/Logo";

export default function Welcome() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="welcome-screen">
      <View style={styles.center}>
        <Logo size={72} color={colors.cream} />
        <Text style={styles.headline}>Mehr clar·heit{"\n"}in deinem Alltag</Text>
        <Text style={styles.sub}>
          Ein ruhiger Ort für deine Apps — entwickelt für strukturierte, neurodiverse Köpfe.
        </Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          testID="welcome-continue-button"
          style={styles.primary}
          onPress={() => router.push("/auth/sign-in")}
        >
          <Text style={styles.primaryText}>Loslegen</Text>
        </Pressable>
        <Text style={styles.legal}>
          Mit dem Fortfahren akzeptierst du unsere Nutzungsbedingungen.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.brand, paddingHorizontal: spacing.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headline: {
    color: colors.cream,
    fontSize: 30,
    fontWeight: "700",
    textAlign: "center",
    marginTop: spacing.xl,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  sub: {
    color: colors.cream,
    opacity: 0.8,
    fontSize: 15,
    textAlign: "center",
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    lineHeight: 22,
  },
  actions: { paddingBottom: spacing.md },
  primary: {
    backgroundColor: colors.cream,
    paddingVertical: 16,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  primaryText: { color: colors.brand, fontSize: 16, fontWeight: "700" },
  legal: { color: colors.cream, opacity: 0.55, fontSize: 11, textAlign: "center", marginTop: spacing.md },
});
