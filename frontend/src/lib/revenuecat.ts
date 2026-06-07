/**
 * RevenueCat integration with safe Expo Go / Web fallback.
 *
 * Real RC runs ONLY in a native build (TestFlight / Production / Dev Client).
 * Expo Go on iOS LOOKS like iOS (Platform.OS === 'ios') but does NOT have
 * the native module — we must detect that and fall back.
 *
 * Product map (matches App Store Connect IAP IDs):
 *   1app    + monthly  →  ch.lautini.clar.1app.monthly   (CHF 4)
 *   1app    + yearly   →  ch.lautini.clar.1app.yearly    (CHF 30)
 *   2apps   + monthly  →  ch.lautini.clar.2apps.monthly  (CHF 6)
 *   2apps   + yearly   →  ch.lautini.clar.2apps.yearly   (CHF 50)
 *
 * Entitlement identifiers in RevenueCat (per-app model):
 *   - "heim"      →  unlocks clar·heim
 *   - "markt"     →  unlocks clar·markt
 *   - "clar.app"  →  generic all-access (treated as bundle)
 *
 * Access rules (consumed by SubscriptionContext):
 *   - clar·heim accessible  if user has  "heim"  OR "clar.app"
 *   - clar·markt accessible if user has  "markt" OR "clar.app"
 *   - Bundle = user has "clar.app" OR (BOTH "heim" AND "markt")
 */
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";

const RC_API_KEY = process.env.EXPO_PUBLIC_RC_IOS_API_KEY ?? "";

export const PRODUCT_IDS = {
  single_monthly: "ch.lautini.clar.1app.monthly",
  single_yearly: "ch.lautini.clar.1app.yearly",
  bundle_monthly: "ch.lautini.clar.2apps.monthly",
  bundle_yearly: "ch.lautini.clar.2apps.yearly",
} as const;

/** RevenueCat entitlement identifiers (per-app model). */
export const ENTITLEMENTS = {
  heim: "heim",
  markt: "markt",
  clarApp: "clar.app",
} as const;

export type RcEntitlementSnapshot = {
  heim: boolean;
  markt: boolean;
  clarApp: boolean;
  activeProductId: string | null;
};

const EMPTY_SNAP: RcEntitlementSnapshot = {
  heim: false,
  markt: false,
  clarApp: false,
  activeProductId: null,
};

let _rcAvailable: boolean | null = null;
let _rcConfigured = false;

function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

export function isNativeBuild(): boolean {
  return Platform.OS === "ios" && !isExpoGo();
}

async function loadPurchases() {
  if (!isNativeBuild()) return null;
  try {
    const mod = await import("react-native-purchases");
    return (mod as any).default ?? mod;
  } catch {
    return null;
  }
}

function snapFromActive(active: Record<string, any> | undefined): RcEntitlementSnapshot {
  if (!active) return { ...EMPTY_SNAP };
  const heim = active[ENTITLEMENTS.heim];
  const markt = active[ENTITLEMENTS.markt];
  const clarApp = active[ENTITLEMENTS.clarApp];
  return {
    heim: !!heim,
    markt: !!markt,
    clarApp: !!clarApp,
    activeProductId:
      clarApp?.productIdentifier ??
      heim?.productIdentifier ??
      markt?.productIdentifier ??
      null,
  };
}

export async function configureRevenueCat(supabaseUserId?: string | null) {
  if (_rcConfigured) return;
  if (!isNativeBuild()) {
    _rcAvailable = false;
    _rcConfigured = true;
    return;
  }
  if (!RC_API_KEY) {
    if (__DEV__) console.warn("[clar] EXPO_PUBLIC_RC_IOS_API_KEY missing");
    _rcAvailable = false;
    _rcConfigured = true;
    return;
  }
  const Purchases = await loadPurchases();
  if (!Purchases) {
    if (__DEV__) console.warn("[clar] react-native-purchases not linked");
    _rcAvailable = false;
    _rcConfigured = true;
    return;
  }
  try {
    if (typeof Purchases.setLogLevel === "function" && __DEV__) {
      try { Purchases.setLogLevel("DEBUG"); } catch { /* ignore */ }
    }
    Purchases.configure({
      apiKey: RC_API_KEY,
      appUserID: supabaseUserId || undefined,
    });
    _rcAvailable = true;
    _rcConfigured = true;
    if (__DEV__) console.log("[clar] RevenueCat configured");
  } catch (e) {
    if (__DEV__) console.warn("[clar] RC configure failed", e);
    _rcAvailable = false;
    _rcConfigured = true;
  }
}

export function isRevenueCatAvailable(): boolean {
  return _rcAvailable === true;
}

export async function rcLogin(supabaseUserId: string) {
  if (!isRevenueCatAvailable()) return;
  const Purchases = await loadPurchases();
  if (!Purchases) return;
  try { await Purchases.logIn(supabaseUserId); }
  catch (e) { if (__DEV__) console.warn("[clar] RC logIn failed", e); }
}

export async function rcLogout() {
  if (!isRevenueCatAvailable()) return;
  const Purchases = await loadPurchases();
  if (!Purchases) return;
  try { await Purchases.logOut(); }
  catch (e) { if (__DEV__) console.warn("[clar] RC logOut failed", e); }
}

export async function getEntitlements(): Promise<RcEntitlementSnapshot | null> {
  if (!isRevenueCatAvailable()) return null;
  const Purchases = await loadPurchases();
  if (!Purchases) return null;
  try {
    const info = await Purchases.getCustomerInfo();
    return snapFromActive(info?.entitlements?.active);
  } catch (e) {
    if (__DEV__) console.warn("[clar] RC getCustomerInfo failed", e);
    return null;
  }
}

export type PurchaseOutcome =
  | { ok: true; productId: string; entitlements: RcEntitlementSnapshot }
  | { ok: false; cancelled: boolean; productNotFound: boolean; error?: string };

export async function purchaseProduct(productId: string): Promise<PurchaseOutcome> {
  if (!isRevenueCatAvailable()) {
    return { ok: false, cancelled: false, productNotFound: false, error: "RC not available" };
  }
  const Purchases = await loadPurchases();
  if (!Purchases) {
    return { ok: false, cancelled: false, productNotFound: false, error: "RC module missing" };
  }
  try {
    let result: any;
    if (typeof Purchases.getProducts === "function") {
      const products = await Purchases.getProducts([productId]).catch(() => []);
      if (!products || products.length === 0) {
        return {
          ok: false,
          cancelled: false,
          productNotFound: true,
          error: `App-Store-Produkt "${productId}" nicht gefunden. Bitte IAP in App Store Connect anlegen.`,
        };
      }
      if (typeof Purchases.purchaseStoreProduct === "function") {
        result = await Purchases.purchaseStoreProduct(products[0]);
      } else {
        result = await Purchases.purchaseProduct(productId);
      }
    } else {
      result = await Purchases.purchaseProduct(productId);
    }
    return {
      ok: true,
      productId,
      entitlements: snapFromActive(result?.customerInfo?.entitlements?.active),
    };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    const cancelled = !!(e?.userCancelled || /cancel/i.test(msg));
    const productNotFound = /product.*(not.*found|unavailable)|no.*offerings/i.test(msg);
    return { ok: false, cancelled, productNotFound, error: msg };
  }
}

export async function restorePurchases(): Promise<RcEntitlementSnapshot | null> {
  if (!isRevenueCatAvailable()) return null;
  const Purchases = await loadPurchases();
  if (!Purchases) return null;
  try {
    const info = await Purchases.restorePurchases();
    return snapFromActive(info?.entitlements?.active);
  } catch (e) {
    if (__DEV__) console.warn("[clar] RC restore failed", e);
    return null;
  }
}

export function productIdFor(plan: "single" | "bundle", period: "monthly" | "yearly"): string {
  return PRODUCT_IDS[`${plan}_${period}`];
}

/**
 * Pure access-rule helpers (used by SubscriptionContext + tests).
 */
export function snapshotUnlocksApp(snap: RcEntitlementSnapshot | null, slug: string): boolean {
  if (!snap) return false;
  if (snap.clarApp) return true;
  if (slug === "heim" && snap.heim) return true;
  if (slug === "markt" && snap.markt) return true;
  return false;
}

export function snapshotIsBundle(snap: RcEntitlementSnapshot | null): boolean {
  if (!snap) return false;
  return snap.clarApp || (snap.heim && snap.markt);
}

export function snapshotAppsUnlocked(snap: RcEntitlementSnapshot | null): string[] {
  if (!snap) return [];
  if (snap.clarApp) return ["heim", "markt"];
  const out: string[] = [];
  if (snap.heim) out.push("heim");
  if (snap.markt) out.push("markt");
  return out;
}
