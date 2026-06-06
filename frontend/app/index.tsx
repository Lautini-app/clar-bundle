import { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { colors, spacing } from "@/src/theme";
import Logo from "@/src/components/Logo";
import { useAuth } from "@/src/auth/context";

export default function Index() {
  const router = useRouter();
  const { isLoading, isAuthed, user } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthed) {
      router.replace("/onboarding/welcome");
    } else if (!user?.selected_apps?.length) {
      router.replace("/onboarding/select-apps");
    } else {
      router.replace("/(main)");
    }
  }, [isLoading, isAuthed, user, router]);

  return (
    <View style={styles.container} testID="splash-screen">
      <Logo size={64} color={colors.cream} />
      <Text style={styles.tagline}>Mehr clar·heit in deinem Alltag</Text>
      <ActivityIndicator color={colors.cream} style={styles.spin} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  tagline: {
    color: colors.cream,
    fontSize: 16,
    marginTop: spacing.md,
    opacity: 0.85,
  },
  spin: { marginTop: spacing.xl },
});
