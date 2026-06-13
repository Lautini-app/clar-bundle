import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { rcLogin, rcLogout } from "../lib/revenuecat";

/**
 * Inline safe log helper — intentionally has NO external module dependency
 * so that a Metro/Hermes bundling edge-case in the diagnostics module
 * can NEVER crash the auth flow.
 */
function safeLog(msg: string): void {
  try {
    if (typeof console !== "undefined") console.log(`[auth] ${msg}`);
  } catch {
    /* noop — never let logging break auth */
  }
}

export type User = {
  id: string;
  apple_user_id: string;
  email?: string | null;
  full_name?: string | null;
  selected_apps: string[];
};

type AuthState = {
  user: User | null;
  isLoading: boolean;
  isAuthed: boolean;
  signInWithApple: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

const SB_ACCESS_KEY = "clar.supabase.access_token";
const SB_REFRESH_KEY = "clar.supabase.refresh_token";
const LOCAL_PREVIEW_USER_KEY = "clar.auth.preview_user";

/**
 * Cache Supabase session tokens so the WebView can hand them off to
 * the embedded clar·apps via URL hash (see SSO_CONTRACT.md).
 */
async function cacheSupabaseTokens(access?: string | null, refresh?: string | null) {
  if (access) await AsyncStorage.setItem(SB_ACCESS_KEY, access);
  if (refresh) await AsyncStorage.setItem(SB_REFRESH_KEY, refresh);
}

function userFromSupabase(
  user: SupabaseUser,
  overrides: { email?: string | null; fullName?: string | null } = {}
): User {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const metadataName =
    (metadata.full_name as string | undefined) ??
    (metadata.name as string | undefined) ??
    null;
  return {
    id: user.id,
    apple_user_id: user.id,
    email: overrides.email ?? user.email ?? null,
    full_name: overrides.fullName ?? metadataName,
    selected_apps: [],
  };
}

async function setPreviewUser(user: User | null) {
  if (user) {
    await AsyncStorage.setItem(LOCAL_PREVIEW_USER_KEY, JSON.stringify(user));
  } else {
    await AsyncStorage.removeItem(LOCAL_PREVIEW_USER_KEY);
  }
}

async function getPreviewUser(): Promise<User | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_PREVIEW_USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        await cacheSupabaseTokens(data.session.access_token, data.session.refresh_token);
        const next = userFromSupabase(data.session.user);
        setUser(next);
        await setPreviewUser(null);
        await rcLogin(next.id);
        return;
      }
    } catch {
      /* fall through to local preview state */
    }

    if (Platform.OS === "web") {
      setUser(await getPreviewUser());
      return;
    }

    setUser(null);
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setIsLoading(false);
    })();
  }, [refresh]);

  const signInWithApple = useCallback(async () => {
    let email: string | null = null;
    let fullName: string | null = null;

    // Wrap the entire Apple Sign-In flow in a single try/catch that
    // captures the RAW error object as JSON (stack, name, code, all
    // properties) and stores it in AsyncStorage under 'clar.lastAuthError'.
    try {
      if (Platform.OS === "ios") {
        // Real Apple Sign In via expo-apple-authentication
        const AppleAuth = await import("expo-apple-authentication");

        // Pre-flight diagnostic: is Apple Sign-In even available on this device/build?
        try {
          const available = await AppleAuth.isAvailableAsync();
          safeLog(`[apple-signin] isAvailable=${available}`);
          if (!available) {
            throw new Error("Apple Sign-In ist auf diesem Gerät nicht verfügbar. Stelle sicher dass du bei iCloud eingeloggt bist.");
          }
        } catch (e: unknown) {
          safeLog(`[apple-signin] isAvailable check failed: ${String((e as Error)?.message ?? e)}`);
        }

        safeLog("[apple-signin] calling AppleAuth.signInAsync …");
        let credential: Awaited<ReturnType<typeof AppleAuth.signInAsync>>;
        try {
          credential = await AppleAuth.signInAsync({
            requestedScopes: [
              AppleAuth.AppleAuthenticationScope.FULL_NAME,
              AppleAuth.AppleAuthenticationScope.EMAIL,
            ],
          });
          safeLog(`[apple-signin] OK — user=${credential.user?.slice(0, 12)}… hasToken=${!!credential.identityToken} hasEmail=${!!credential.email}`);
        } catch (e: unknown) {
          // Surface the EXACT Apple error so we can diagnose
          const err = e as { code?: string; message?: string; name?: string };
          const code = err?.code ?? "unknown";
          const msg = err?.message ?? String(e);
          safeLog(`[apple-signin] FAILED code=${code} name=${err?.name ?? "?"} msg=${msg}`);
          // ERR_REQUEST_CANCELED → user dismissed → silent
          if (code === "ERR_REQUEST_CANCELED" || /cancel/i.test(msg)) {
            throw new Error("Anmeldung abgebrochen");
          }
          // ERR_REQUEST_UNKNOWN → "authorization attempt failed for an unknown reason"
          //   → 99% des Provisioning Profile fehlt die Sign-in-with-Apple Entitlement,
          //   ODER der User hat App-Zugang in iOS-Settings widerrufen
          throw new Error(
            `Apple Sign-In fehlgeschlagen (${code}): ${msg}. ` +
            `Tipp: iPhone → Einstellungen → Apple-ID → Passwort & Sicherheit → ` +
            `"Mit Apple anmelden" → falls "clar" gelistet ist, App-Zugang ` +
            `entfernen und erneut versuchen. Sonst ist das Provisioning ` +
            `Profile ohne "Sign in with Apple" Entitlement signiert worden.`
          );
        }

        if (!credential.identityToken) {
          safeLog("[apple-signin] no identityToken in credential");
          throw new Error("Apple Sign-In: kein identityToken erhalten");
        }

        // Exchange Apple identity token for a Supabase session. No shell
        // backend token is minted anymore; Supabase is the app identity.
        safeLog("[apple-signin] calling supabase.auth.signInWithIdToken …");
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: "apple",
          token: credential.identityToken,
        });
        if (error || !data.session) {
          safeLog(`[apple-signin] supabase failed: ${error?.message ?? "no session"}`);
          throw new Error(error?.message ?? "Supabase signIn fehlgeschlagen");
        }
        safeLog("[apple-signin] supabase session OK");

        email = credential.email ?? data.user?.email ?? null;
        if (credential.fullName) {
          const parts = [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean);
          if (parts.length) fullName = parts.join(" ");
        }
        await cacheSupabaseTokens(data.session.access_token, data.session.refresh_token);

        const next = userFromSupabase(data.user, { email, fullName });
        setUser(next);
        await setPreviewUser(null);
        await rcLogin(next.id);
      } else {
        // Web / Expo Go fallback used only for local preview.
        const mockUser: User = {
          id: `mock_${Date.now()}`,
          apple_user_id: `mock_${Date.now()}`,
          email: `dev+${Date.now()}@clar.local`,
          full_name: "Apple User",
          selected_apps: [],
        };
        await setPreviewUser(mockUser);
        setUser(mockUser);
        await rcLogin(mockUser.id);
      }

      // Success → clear any previous error blob
      try { await AsyncStorage.removeItem("clar.lastAuthError"); } catch { /* noop */ }
    } catch (rootErr: unknown) {
      // CAPTURE EVERYTHING about the error — name, message, code, stack,
      // own properties — and persist as JSON so the Diagnose screen can
      // surface it. This is the only reliable way to debug a production
      // iOS build where console.log is invisible.
      try {
        const err = rootErr as Record<string, unknown> & { stack?: string; message?: string; name?: string };
        const ownProps: Record<string, unknown> = {};
        try {
          for (const k of Object.getOwnPropertyNames(err ?? {})) {
            try { ownProps[k] = (err as Record<string, unknown>)[k]; } catch { /* skip */ }
          }
        } catch { /* skip */ }
        const blob = {
          ts: Date.now(),
          when: "signInWithApple",
          buildVersion: "see Diagnose → App-Version",
          name: err?.name ?? typeof rootErr,
          message: err?.message ?? String(rootErr),
          stack: err?.stack ?? "(no stack)",
          ownProps,
          stringified: (() => { try { return JSON.stringify(rootErr); } catch { return "(unserializable)"; } })(),
        };
        await AsyncStorage.setItem("clar.lastAuthError", JSON.stringify(blob, null, 2));
        safeLog(`[apple-signin] CAUGHT ROOT: name=${blob.name} msg=${blob.message}`);
      } catch { /* never let logging crash auth */ }
      // Re-throw so the sign-in screen still displays the error
      throw rootErr;
    }
  }, []);

  /**
   * Hidden reviewer login (App Store Review Notes: tap "clar" logo 5× to reveal).
   * Uses Supabase email/password sign-in directly; no shell backend exchange.
   */
  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !password) throw new Error("E-Mail und Passwort sind erforderlich");

    if (Platform.OS === "web") {
      // Web preview: Supabase may not be configured with valid keys.
      const mockUser: User = {
        id: `mock_${trimmed}`,
        apple_user_id: `mock_${trimmed}`,
        email: trimmed,
        full_name: "Reviewer",
        selected_apps: [],
      };
      await setPreviewUser(mockUser);
      setUser(mockUser);
      await rcLogin(mockUser.id);
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    });
    if (error || !data.session) {
      throw new Error(error?.message ?? "Anmeldung fehlgeschlagen");
    }
    await cacheSupabaseTokens(data.session.access_token, data.session.refresh_token);

    const next = userFromSupabase(data.user, {
      email: data.user?.email ?? trimmed,
      fullName: (data.user?.user_metadata?.full_name as string | undefined) ?? null,
    });
    await setPreviewUser(null);
    setUser(next);
    await rcLogin(next.id);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    await rcLogout();
    await setPreviewUser(null);
    await AsyncStorage.multiRemove([SB_ACCESS_KEY, SB_REFRESH_KEY]);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthed: !!user, signInWithApple, signInWithEmail, signOut, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
