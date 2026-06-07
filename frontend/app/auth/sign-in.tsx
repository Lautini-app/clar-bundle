import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth/context";
import { colors, spacing, radius } from "@/src/theme";
import Logo from "@/src/components/Logo";

export default function SignIn() {
  const router = useRouter();
  const { signInWithApple } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onApple = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithApple();
      router.replace("/(main)");
    } catch (e: any) {
      const msg = e?.message ?? "Anmeldung fehlgeschlagen";
      // user-cancel from Apple sheet returns a specific error code — silent
      if (/ERR_CANCELED|cancel/i.test(msg)) {
        setError(null);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="sign-in-screen">
      <Pressable testID="back-button" onPress={() => router.back()} style={styles.back}>
        <Ionicons name="chevron-back" size={24} color={colors.cream} />
      </Pressable>
      <View style={styles.center}>
        <Logo size={56} color={colors.cream} />
        <Text style={styles.headline}>Anmelden</Text>
        <Text style={styles.sub}>
          Einmal anmelden — du bist in allen{"\n"}clar·Apps automatisch eingeloggt.
        </Text>
      </View>
      <View style={styles.actions}>
        <Pressable testID="sign-in-apple-button" style={styles.appleBtn} onPress={onApple} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={colors.cream} />
          ) : (
            <>
              <Ionicons name="logo-apple" size={20} color={colors.cream} style={{ marginRight: 8 }} />
              <Text style={styles.appleText}>Mit Apple anmelden</Text>
            </>
          )}
        </Pressable>
        {error && <Text style={styles.error}>{error}</Text>}
        <Text style={styles.dev}>
          {Platform.OS === "web"
            ? "Web-Vorschau: MOCK Sign-In. Echtes Apple Sign-In im nativen iOS-Build."
            : "Apple Sign-In + Supabase verbunden."}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.brand, paddingHorizontal: spacing.lg },
  back: { width: 40, height: 40, alignItems: "flex-start", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headline: { color: colors.cream, fontSize: 28, fontWeight: "700", marginTop: spacing.xl, letterSpacing: -0.4 },
  sub: { color: colors.cream, opacity: 0.8, fontSize: 15, textAlign: "center", marginTop: spacing.md, lineHeight: 22 },
  actions: { paddingBottom: spacing.md, gap: spacing.sm },
  appleBtn: {
    backgroundColor: colors.ink,
    paddingVertical: 16,
    borderRadius: radius.pill,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  appleText: { color: colors.cream, fontSize: 16, fontWeight: "700" },
  error: { color: "#FFBDBD", fontSize: 13, textAlign: "center" },
  dev: { color: colors.cream, opacity: 0.55, fontSize: 11, textAlign: "center" },
});
