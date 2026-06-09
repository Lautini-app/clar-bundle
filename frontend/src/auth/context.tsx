import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, User } from "../api/client";
import { supabase } from "../lib/supabase";
import { rcLogin, rcLogout } from "../lib/revenuecat";

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

/**
 * Cache Supabase session tokens so the WebView can hand them off to
 * the embedded clar·apps via URL hash (see SSO_CONTRACT.md).
 */
async function cacheSupabaseTokens(access?: string | null, refresh?: string | null) {
  if (access) await AsyncStorage.setItem(SB_ACCESS_KEY, access);
  if (refresh) await AsyncStorage.setItem(SB_REFRESH_KEY, refresh);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const token = await api.getToken();
      if (!token) {
        setUser(null);
        return;
      }
      const me = await api.me();
      setUser(me);
    } catch {
      setUser(null);
      await api.clearToken();
    }
  }, []);

  useEffect(() => {
    (async () => {
      // restore Supabase session if cached
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          await cacheSupabaseTokens(data.session.access_token, data.session.refresh_token);
        }
      } catch {
        /* ignore */
      }
      await refresh();
      setIsLoading(false);
    })();
  }, [refresh]);

  const signInWithApple = useCallback(async () => {
    let supabaseAccessToken: string;
    let appleUserId: string;
    let email: string | null = null;
    let fullName: string | null = null;

    if (Platform.OS === "ios") {
      // Real Apple Sign In via expo-apple-authentication
      const AppleAuth = await import("expo-apple-authentication");
      const credential = await AppleAuth.signInAsync({
        requestedScopes: [
          AppleAuth.AppleAuthenticationScope.FULL_NAME,
          AppleAuth.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error("Apple Sign-In: kein identityToken erhalten");
      }

      // Exchange Apple identity token for Supabase session
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
      });
      if (error || !data.session) throw new Error(error?.message ?? "Supabase signIn fehlgeschlagen");

      supabaseAccessToken = data.session.access_token;
      appleUserId = data.user?.id ?? credential.user;
      email = credential.email ?? data.user?.email ?? null;
      if (credential.fullName) {
        const parts = [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean);
        if (parts.length) fullName = parts.join(" ");
      }
      await cacheSupabaseTokens(data.session.access_token, data.session.refresh_token);
    } else {
      // Web / Expo Go fallback: MOCK Apple Sign In via Supabase anonymous-ish flow
      // Used only for preview — real iOS build goes through the native path above.
      const mockEmail = `dev+${Date.now()}@clar.local`;
      const mockId = `mock_${Date.now()}`;
      appleUserId = mockId;
      email = mockEmail;
      fullName = "Apple User";
      // For Web preview we don't actually hit Supabase. Skip — backend creates user.
      supabaseAccessToken = "";
    }

    // Tell Shell-Backend → mints Shell-JWT for /api/subscription/* etc.
    const res = await api.signInWithApple({
      apple_user_id: appleUserId,
      email,
      full_name: fullName,
      supabase_access_token: supabaseAccessToken || null,
    });
    await api.setToken(res.token);
    // Tie this device's RevenueCat anonymous purchases to the Supabase user.
    await rcLogin(appleUserId);
    await refresh();
  }, [refresh]);

  /**
   * Hidden reviewer login (App Store Review Notes: tap "clar" logo 5× to reveal).
   * Uses Supabase email/password sign-in, then exchanges the Supabase token
   * with the shell backend — same flow as Apple, just a different identity
   * provider. The backend auto-grants all entitlements for the reviewer email
   * (see _is_reviewer in server.py), so the reviewer never needs to make an
   * IAP purchase to test the embedded clar·apps.
   */
  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !password) throw new Error("E-Mail und Passwort sind erforderlich");

    if (Platform.OS === "web") {
      // Web preview: Supabase may not be configured with valid keys; we just
      // skip the Supabase round-trip and let the backend create a mock user.
      const mockId = `mock_${trimmed}`;
      const res = await api.signInWithApple({
        apple_user_id: mockId,
        email: trimmed,
        full_name: "Reviewer",
        supabase_access_token: null,
      });
      await api.setToken(res.token);
      await rcLogin(mockId);
      await refresh();
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

    const res = await api.signInWithApple({
      apple_user_id: data.user?.id ?? `email_${trimmed}`,
      email: data.user?.email ?? trimmed,
      full_name: (data.user?.user_metadata?.full_name as string | undefined) ?? null,
      supabase_access_token: data.session.access_token,
    });
    await api.setToken(res.token);
    await rcLogin(data.user?.id ?? trimmed);
    await refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    await rcLogout();
    await api.clearToken();
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
