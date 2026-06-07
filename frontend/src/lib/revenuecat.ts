/**
 * RevenueCat integration with safe Expo Go / Web fallback.
 *
 * Real RC runs ONLY in a native build (TestFlight / Production / Dev Client)
 * with the SDK linked. Expo Go on iOS LOOKS like iOS (Platform.OS === 'ios')
 * but does NOT have the native module — we must detect that and fall back.
 *
 * Product map (matches App Store Connect IAP IDs):
 *   single_app + monthly  →  clar_single_monthly  (CHF 4)
 *   single_app + yearly   →  clar_single_yearly   (CHF 30)
 *   bundle     + monthly  →  clar_bundle_monthly  (CHF 6)
 *   bundle     + yearly   →  clar_bundle_yearly   (CHF 50)
 *
 * Entitlement identifiers in RevenueCat:
 *   - "single_app"  (attached to single_* products)
 *   - "bundle"      (attached to bundle_* products)
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

export const ENTITLEMENTS = {
  singleApp: "single_app",
  bundle: "bundle",
} as const;

export type RcEntitlementSnapshot = {
  hasBundle: boolean;
  hasSingleApp: boolean;
  activeProductId: string | null;
};

let _rcAvailable: boolean | null = null;
let _rcConfigured = false;

/** True only inside Expo Go (no native modules) */
function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/** True in a native iOS build (TestFlight / App Store / dev client). */
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
  try {
    await Purchases.logIn(supabaseUserId);
  } catch (e) {
    if (__DEV__) console.warn("[clar] RC logIn failed", e);
  }
}

export async function rcLogout() {
  if (!isRevenueCatAvailable()) return;
  const Purchases = await loadPurchases();
  if (!Purchases) return;
  try {
    await Purchases.logOut();
  } catch (e) {
    if (__DEV__) console.warn("[clar] RC logOut failed", e);
  }
}

export async function getEntitlements(): Promise<RcEntitlementSnapshot | null> {
  if (!isRevenueCatAvailable()) return null;
  const Purchases = await loadPurchases();
  if (!Purchases) return null;
  try {
    const info = await Purchases.getCustomerInfo();
    const ents = info?.entitlements?.active ?? {};
    const bundleEnt = ents[ENTITLEMENTS.bundle];
    const singleEnt = ents[ENTITLEMENTS.singleApp];
    return {
      hasBundle: !!bundleEnt,
      hasSingleApp: !!singleEnt,
      activeProductId:
        bundleEnt?.productIdentifier ?? singleEnt?.productIdentifier ?? null,
    };
  } catch (e) {
    if (__DEV__) console.warn("[clar] RC getCustomerInfo failed", e);
    return null;
  }
}

export type PurchaseOutcome =
  | { ok: true; productId: string; hasBundle: boolean; hasSingleApp: boolean }
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
    // Prefer purchaseStoreProduct (works for IAPs not yet in any offering),
    // fall back to purchaseProduct for older SDKs.
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
    const ents = result?.customerInfo?.entitlements?.active ?? {};
    return {
      ok: true,
      productId,
      hasBundle: !!ents[ENTITLEMENTS.bundle],
      hasSingleApp: !!ents[ENTITLEMENTS.singleApp],
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
    const ents = info?.entitlements?.active ?? {};
    return {
      hasBundle: !!ents[ENTITLEMENTS.bundle],
      hasSingleApp: !!ents[ENTITLEMENTS.singleApp],
      activeProductId:
        ents[ENTITLEMENTS.bundle]?.productIdentifier ??
        ents[ENTITLEMENTS.singleApp]?.productIdentifier ??
        null,
    };
  } catch (e) {
    if (__DEV__) console.warn("[clar] RC restore failed", e);
    return null;
  }
}

export function productIdFor(plan: "single" | "bundle", period: "monthly" | "yearly"): string {
  return PRODUCT_IDS[`${plan}_${period}`];
}
