import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "clar.auth.token";

export type ClarApp = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  icon: string;
  color: string;
  available: boolean;
};

export type SubscriptionStatus = {
  plan: "single" | "bundle" | null;
  entitlement: "single_app" | "bundle" | null;
  apps_unlocked: string[];
  billing_period: "monthly" | "yearly" | null;
  price_chf: number | null;
  expires_at: string | null;
};

export type User = {
  id: string;
  apple_user_id: string;
  email?: string | null;
  full_name?: string | null;
  selected_apps: string[];
};

async function authHeaders() {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await authHeaders()),
    ...((opts.headers as Record<string, string>) || {}),
  };
  const res = await fetch(`${BASE}/api${path}`, { ...opts, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  setToken: (t: string) => AsyncStorage.setItem(TOKEN_KEY, t),
  clearToken: () => AsyncStorage.removeItem(TOKEN_KEY),
  getToken: () => AsyncStorage.getItem(TOKEN_KEY),

  listApps: () => req<ClarApp[]>("/apps"),

  signInWithApple: (apple_user_id: string, email?: string, full_name?: string) =>
    req<{ token: string; user_id: string; email?: string; full_name?: string }>(
      "/auth/apple",
      { method: "POST", body: JSON.stringify({ apple_user_id, email, full_name }) }
    ),

  me: () => req<User>("/auth/me"),

  saveSelectedApps: (selected_apps: string[]) =>
    req<{ selected_apps: string[] }>("/user/selected-apps", {
      method: "POST",
      body: JSON.stringify({ selected_apps }),
    }),

  subscriptionStatus: () => req<SubscriptionStatus>("/subscription/status"),

  purchase: (plan: "single" | "bundle", billing_period: "monthly" | "yearly", app_slug?: string) =>
    req<SubscriptionStatus>("/subscription/purchase", {
      method: "POST",
      body: JSON.stringify({ plan, billing_period, app_slug }),
    }),

  cancel: () => req<{ status: string }>("/subscription/cancel", { method: "POST" }),

  ssoToken: () => req<{ sso_token: string; user_id: string }>("/sso/token"),
};
