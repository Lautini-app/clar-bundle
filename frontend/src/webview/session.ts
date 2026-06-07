/**
 * WebView session helpers — handle cookie/cache cleanup on logout.
 *
 * In native builds, we call CookieManager.clearAll() to invalidate
 * Supabase session cookies stored by the embedded clar·apps so the
 * next user does not land on a stale logged-in session.
 *
 * In web/Expo Go preview, this is a no-op.
 */
import { Platform } from "react-native";

export async function clearWebViewSession(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const mod = await import("@react-native-cookies/cookies");
    const CookieManager = mod.default;
    await CookieManager.clearAll(true); // useWebKit on iOS
  } catch (e) {
    // module not available in Expo Go — safe to ignore for preview
    if (__DEV__) console.warn("[clar] cookie cleanup skipped:", e);
  }
}
