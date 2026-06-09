import { useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, Platform,
  Modal, TextInput, KeyboardAvoidingView,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth/context";
import { colors, spacing, radius } from "@/src/theme";
import Logo from "@/src/components/Logo";

// Reviewer-Login wird durch 5 schnelle Logo-Taps geöffnet.
// Trigger-Fenster: alle Taps müssen innerhalb von 2s erfolgen, sonst Counter-Reset.
const REVIEWER_TAP_COUNT = 5;
const REVIEWER_TAP_WINDOW_MS = 2000;

export default function SignIn() {
  const router = useRouter();
  const { signInWithApple, signInWithEmail } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hidden reviewer modal state
  const [reviewerOpen, setReviewerOpen] = useState(false);
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [reviewerPw, setReviewerPw] = useState("");
  const [reviewerLoading, setReviewerLoading] = useState(false);
  const [reviewerError, setReviewerError] = useState<string | null>(null);
  const tapCountRef = useRef(0);
  const lastTapAtRef = useRef(0);

  const onLogoPress = () => {
    const now = Date.now();
    if (now - lastTapAtRef.current > REVIEWER_TAP_WINDOW_MS) tapCountRef.current = 0;
    lastTapAtRef.current = now;
    tapCountRef.current += 1;
    if (tapCountRef.current >= REVIEWER_TAP_COUNT) {
      tapCountRef.current = 0;
      setReviewerError(null);
      setReviewerOpen(true);
    }
  };

  const onApple = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithApple();
      router.replace("/(main)");
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? "Anmeldung fehlgeschlagen";
      if (/ERR_CANCELED|cancel/i.test(msg)) setError(null);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const onReviewerSubmit = async () => {
    setReviewerLoading(true);
    setReviewerError(null);
    try {
      await signInWithEmail(reviewerEmail, reviewerPw);
      setReviewerOpen(false);
      setReviewerEmail("");
      setReviewerPw("");
      router.replace("/(main)");
    } catch (e: unknown) {
      setReviewerError((e as Error)?.message ?? "Anmeldung fehlgeschlagen");
    } finally {
      setReviewerLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="sign-in-screen">
      <Pressable testID="back-button" onPress={() => router.back()} style={styles.back}>
        <Ionicons name="chevron-back" size={24} color={colors.cream} />
      </Pressable>

      <View style={styles.center}>
        <Pressable
          testID="reviewer-logo-trigger"
          onPress={onLogoPress}
          hitSlop={16}
          // Visually identical to a static logo — only a Pressable wrapper so
          // 5× rapid taps unlock the hidden reviewer modal. Documented in
          // App Store Connect → "Informationen zur App-Prüfung".
        >
          <Logo size={56} color={colors.cream} />
        </Pressable>
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

      {/* Hidden reviewer login — opened by 5× logo tap. */}
      <Modal
        visible={reviewerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setReviewerOpen(false)}
        testID="reviewer-modal"
      >
        <Pressable style={styles.backdrop} onPress={() => setReviewerOpen(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalKeyboard}
          >
            <Pressable style={styles.modalCard} onPress={() => { /* swallow */ }}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Reviewer-Login</Text>
                <Pressable
                  onPress={() => setReviewerOpen(false)}
                  hitSlop={8}
                  testID="reviewer-modal-close"
                >
                  <Ionicons name="close" size={22} color={colors.ink} />
                </Pressable>
              </View>
              <Text style={styles.modalHint}>
                Nur für App-Store-Reviewer. Normale Nutzer melden sich mit Apple an.
              </Text>

              <TextInput
                testID="reviewer-email"
                value={reviewerEmail}
                onChangeText={setReviewerEmail}
                placeholder="E-Mail"
                placeholderTextColor={colors.inkMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                style={styles.input}
                editable={!reviewerLoading}
              />
              <TextInput
                testID="reviewer-password"
                value={reviewerPw}
                onChangeText={setReviewerPw}
                placeholder="Passwort"
                placeholderTextColor={colors.inkMuted}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                style={styles.input}
                editable={!reviewerLoading}
                onSubmitEditing={onReviewerSubmit}
              />

              {reviewerError && <Text style={styles.modalError}>{reviewerError}</Text>}

              <Pressable
                testID="reviewer-submit"
                onPress={onReviewerSubmit}
                disabled={reviewerLoading || !reviewerEmail || !reviewerPw}
                style={({ pressed }) => [
                  styles.modalSubmit,
                  (reviewerLoading || !reviewerEmail || !reviewerPw) && { opacity: 0.5 },
                  pressed && { opacity: 0.8 },
                ]}
              >
                {reviewerLoading ? (
                  <ActivityIndicator color={colors.cream} />
                ) : (
                  <Text style={styles.modalSubmitText}>Anmelden</Text>
                )}
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
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

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  modalKeyboard: { width: "100%", alignItems: "center" },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  modalHint: { fontSize: 12, color: colors.inkMuted, marginBottom: spacing.sm, lineHeight: 16 },
  input: {
    backgroundColor: colors.divider + "33",
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    fontSize: 15,
    color: colors.ink,
  },
  modalError: { color: colors.danger, fontSize: 13, marginTop: 4 },
  modalSubmit: {
    backgroundColor: colors.brand,
    paddingVertical: 14,
    borderRadius: radius.pill,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  modalSubmitText: { color: colors.cream, fontWeight: "700", fontSize: 15 },
});
