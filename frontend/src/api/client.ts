import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "clar.auth.token";
const USER_KEY = "clar.auth.user";
const SUBSCRIPTION_KEY = "clar.subscription.status";
const REVIEWER_EMAIL = "appstore.reviewer@lautini.ch";

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

export type AppleSignInArgs = {
  apple_user_id: string;
  email?: string | null;
  full_name?: string | null;
  supabase_access_token?: string | null;
};

const LOCAL_APPS: ClarApp[] = [
  {
    slug: "heim",
    name: "clar·heim",
    tagline: "Haushaltsorganisation",
    description: "Strukturiere deinen Haushalt mit klaren Routinen und Listen.",
    url: "https://clar.heim.lautini.ch",
    icon: "home",
    color: "#2E5C3E",
    available: true,
  },
  {
    slug: "markt",
    name: "clar·markt",
    tagline: "Einkaufsplanung",
    description: "Einkaufslisten, die mit dir mitdenken.",
    url: "https://clar.markt.lautini.ch",
    icon: "cart",
    color: "#C97B3A",
    available: true,
  },
  {
    slug: "log",
    name: "clar·log",
    tagline: "Stimulanzien-Tagebuch",
    description: "Dokumentiere Dosis, Wirkung und Nebenwirkungen — bald verfügbar.",
    url: "",
    icon: "book",
    color: "#5B7AAE",
    available: false,
  },
  {
    slug: "tag",
    name: "clar·tag",
    tagline: "Tagesstruktur & Routinen",
    description: "Ruhige Tagesplanung für neurodiverse Köpfe — bald verfügbar.",
    url: "",
    icon: "time",
    color: "#A85C7D",
    available: false,
  },
];

const AVAILABLE_APP_SLUGS = LOCAL_APPS.filter((app) => app.available).map((app) => app.slug);
const PRICING: Record<`${"single" | "bundle"}-${"monthly" | "yearly"}`, number> = {
  "single-monthly": 4,
  "single-yearly": 30,
  "bundle-monthly": 6,
  "bundle-yearly": 50,
};

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
}

function localTokenFor(userId: string): string {
  return `local:${userId}:${Date.now()}`;
}

function emptySubscription(): SubscriptionStatus {
  return {
    plan: null,
    entitlement: null,
    apps_unlocked: [],
    billing_period: null,
    price_chf: null,
    expires_at: null,
  };
}

function expiresAtFor(period: "monthly" | "yearly"): string {
  const d = new Date();
  d.setDate(d.getDate() + (period === "monthly" ? 30 : 365));
  return d.toISOString();
}

async function saveSubscription(status: SubscriptionStatus): Promise<SubscriptionStatus> {
  await AsyncStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(status));
  return status;
}

export const api = {
  setToken: (t: string) => AsyncStorage.setItem(TOKEN_KEY, t),
  clearToken: () => AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY, SUBSCRIPTION_KEY]),
  getToken: () => AsyncStorage.getItem(TOKEN_KEY),

  listApps: async () => LOCAL_APPS,

  signInWithApple: async (args: AppleSignInArgs) => {
    const existing = await readJson<User>(USER_KEY);
    const isSameUser = existing?.apple_user_id === args.apple_user_id;
    const user: User = {
      id: isSameUser ? existing.id : args.apple_user_id,
      apple_user_id: args.apple_user_id,
      email: args.email ?? (isSameUser ? existing?.email ?? null : null),
      full_name: args.full_name ?? (isSameUser ? existing?.full_name ?? null : null),
      selected_apps: isSameUser ? existing?.selected_apps ?? [] : [],
    };
    const token = localTokenFor(user.id);
    await AsyncStorage.multiSet([
      [USER_KEY, JSON.stringify(user)],
      [TOKEN_KEY, token],
    ]);
    if ((user.email ?? "").toLowerCase() === REVIEWER_EMAIL) {
      await saveSubscription({
        plan: "bundle",
        entitlement: "bundle",
        apps_unlocked: AVAILABLE_APP_SLUGS,
        billing_period: "yearly",
        price_chf: 0,
        expires_at: expiresAtFor("yearly"),
      });
    } else if (!isSameUser) {
      await AsyncStorage.removeItem(SUBSCRIPTION_KEY);
    }
    return {
      token,
      user_id: user.id,
      email: user.email ?? undefined,
      full_name: user.full_name ?? undefined,
    };
  },

  me: async () => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    const user = await readJson<User>(USER_KEY);
    if (!token || !user) throw new Error("Keine lokale Sitzung gefunden");
    return user;
  },

  saveSelectedApps: async (selected_apps: string[]) => {
    const user = await readJson<User>(USER_KEY);
    if (!user) throw new Error("Keine lokale Sitzung gefunden");
    const selected = selected_apps.filter((slug) => AVAILABLE_APP_SLUGS.includes(slug));
    await AsyncStorage.setItem(USER_KEY, JSON.stringify({ ...user, selected_apps: selected }));
    return { selected_apps: selected };
  },

  subscriptionStatus: async () => (await readJson<SubscriptionStatus>(SUBSCRIPTION_KEY)) ?? emptySubscription(),

  purchase: async (plan: "single" | "bundle", billing_period: "monthly" | "yearly", app_slug?: string) => {
    if (plan === "single" && (!app_slug || !AVAILABLE_APP_SLUGS.includes(app_slug))) {
      throw new Error("Ungueltige App fuer Einzel-Abo");
    }
    const apps_unlocked = plan === "single" ? [app_slug as string] : AVAILABLE_APP_SLUGS;
    const status: SubscriptionStatus = {
      plan,
      entitlement: plan === "single" ? "single_app" : "bundle",
      apps_unlocked,
      billing_period,
      price_chf: PRICING[`${plan}-${billing_period}`],
      expires_at: expiresAtFor(billing_period),
    };
    return saveSubscription(status);
  },

  cancel: async () => {
    await AsyncStorage.removeItem(SUBSCRIPTION_KEY);
    return { status: "cancelled" };
  },

  ssoToken: async () => {
    const user = await readJson<User>(USER_KEY);
    if (!user) throw new Error("Keine lokale Sitzung gefunden");
    return { sso_token: localTokenFor(user.id), user_id: user.id };
  },
};
