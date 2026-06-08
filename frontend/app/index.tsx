import { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "@/src/theme";
import { useAuth } from "@/src/auth/context";

/**
 * Invisible splash router.
 *
 * The native splash (dark green, no image) stays up via _layout.tsx until
 * fonts are loaded. Auth check then runs here and replaces to the right
 * route. We intentionally render NOTHING visible (only the brand-green
 * background) so there is no double-flash with /onboarding/welcome which
 * also shows the "clar" logo + tagline.
 */
export default function Index() {
  const router = useRouter();
  const { isLoading, isAuthed } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthed) {
      router.replace("/onboarding/welcome");
    } else {
      router.replace("/(main)");
    }
  }, [isLoading, isAuthed, router]);

  return <View style={styles.container} testID="splash-screen" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.brand,
  },
});
