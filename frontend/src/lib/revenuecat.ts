/**
 * RevenueCat integration with safe Expo Go / Web fallback.
 *
 * - On native iOS we use react-native-purchases for real IAPs.
 * - On Web / Android Expo Go we no-op so the preview keeps working
 *   and the subscription context falls back to the mock backend.
 *
 * Public product map (matches App Store Connect IAP IDs):
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

const RC_API_KEY = process.env.EXPO_PUBLIC_RC_IOS_API_KEY ?? "";

export const PRODUCT_IDS = {
  single_monthly: "clar_single_monthly",
  single_yearly: "clar_single_yearly",
  bundle_monthly: "clar_bundle_monthly",
  bundle_yearly: "clar_bundle_yearly",
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

function isNativeIOS() {
  return Platform.OS === "ios";
}

async function loadPurchases() {
  if (!isNativeIOS()) return null;
  try {
    const mod = await import("react-native-purchases");
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

export async function configureRevenueCat(supabaseUserId?: string | null) {
  if (!isNativeIOS()) {
    _rcAvailable = false;
    return;
  }
  if (!RC_API_KEY) {
    if (__DEV__) console.warn("[clar] RC_API_KEY missing");
    _rcAvailable = false;
    return;
  }
  const Purchases = await loadPurchases();
  if (!Purchases) {
    _rcAvailable = false;
    return;
  }
  try {
    Purchases.configure({
      apiKey: RC_API_KEY,
      appUserID: supabaseUserId || undefined,
    });
    _rcAvailable = true;
  } catch (e) {
    if (__DEV__) console.warn("[clar] RC configure failed", e);
    _rcAvailable = false;
  }
}

export async function rcLogin(supabaseUserId: string) {
  if (!isNativeIOS()) return;
  const Purchases = await loadPurchases();
  if (!Purchases) return;
  try {
    await Purchases.logIn(supabaseUserId);
  } catch (e) {
    if (__DEV__) console.warn("[clar] RC logIn failed", e);
  }
}

export async function rcLogout() {
  if (!isNativeIOS()) return;
  const Purchases = await loadPurchases();
  if (!Purchases) return;
  try {
    await Purchases.logOut();
  } catch (e) {
    if (__DEV__) console.warn("[clar] RC logOut failed", e);
  }
}

export async function getEntitlements(): Promise<RcEntitlementSnapshot | null> {
  if (!isNativeIOS()) return null;
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
  | { ok: false; cancelled: boolean; error?: string };

export async function purchaseProduct(productId: string): Promise<PurchaseOutcome> {
  if (!isNativeIOS()) {
    return { ok: false, cancelled: false, error: "Not iOS native" };
  }
  const Purchases = await loadPurchases();
  if (!Purchases) {
    return { ok: false, cancelled: false, error: "Purchases module unavailable" };
  }
  try {
    const result = await Purchases.purchaseProduct(productId);
    const ents = result?.customerInfo?.entitlements?.active ?? {};
    return {
      ok: true,
      productId,
      hasBundle: !!ents[ENTITLEMENTS.bundle],
      hasSingleApp: !!ents[ENTITLEMENTS.singleApp],
    };
  } catch (e: any) {
    const cancelled = !!(e?.userCancelled || /cancel/i.test(e?.message ?? ""));
    return { ok: false, cancelled, error: e?.message };
  }
}

export async function restorePurchases(): Promise<RcEntitlementSnapshot | null> {
  if (!isNativeIOS()) return null;
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

export function isRevenueCatAvailable(): boolean {
  return _rcAvailable === true;
}
