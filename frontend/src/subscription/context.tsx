import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AVAILABLE_APP_SLUGS } from "../api/apps";
import { useAuth } from "../auth/context";
import {
  PRODUCT_IDS,
  purchaseProduct,
  productIdFor,
  restorePurchases as rcRestore,
  isRevenueCatAvailable,
  getEntitlements as rcGetEntitlements,
  snapshotUnlocksApp,
  snapshotIsBundle,
  snapshotAppsUnlocked,
  RcEntitlementSnapshot,
} from "../lib/revenuecat";

export type SubscriptionStatus = {
  plan: "single" | "bundle" | null;
  entitlement: "single_app" | "bundle" | null;
  apps_unlocked: string[];
  billing_period: "monthly" | "yearly" | null;
  price_chf: number | null;
  expires_at: string | null;
};

type SubState = {
  status: SubscriptionStatus | null;
  rcEntitlements: RcEntitlementSnapshot | null;
  isLoading: boolean;
  hasEntitlement: (appSlug: string) => boolean;
  hasBundle: boolean;
  refresh: () => Promise<void>;
  purchase: (plan: "single" | "bundle", period: "monthly" | "yearly", appSlug?: string) => Promise<void>;
  cancel: () => Promise<void>;
  restore: () => Promise<void>;
};

const SubContext = createContext<SubState | undefined>(undefined);

const PREVIEW_STATUS_KEY = "clar.subscription.preview_status";
const REVIEWER_EMAIL = (process.env.EXPO_PUBLIC_REVIEWER_EMAIL ?? "appstore.reviewer@lautini.ch").toLowerCase();

const PRICES = {
  "single-monthly": 4,
  "single-yearly": 30,
  "bundle-monthly": 6,
  "bundle-yearly": 50,
} as const;

function reviewerStatus(): SubscriptionStatus {
  return {
    plan: "bundle",
    entitlement: "bundle",
    apps_unlocked: AVAILABLE_APP_SLUGS,
    billing_period: null,
    price_chf: 0,
    expires_at: null,
  };
}

function productMeta(productId: string | null): Pick<SubscriptionStatus, "plan" | "billing_period" | "price_chf"> | null {
  switch (productId) {
    case PRODUCT_IDS.single_monthly:
      return { plan: "single", billing_period: "monthly", price_chf: PRICES["single-monthly"] };
    case PRODUCT_IDS.single_yearly:
      return { plan: "single", billing_period: "yearly", price_chf: PRICES["single-yearly"] };
    case PRODUCT_IDS.bundle_monthly:
      return { plan: "bundle", billing_period: "monthly", price_chf: PRICES["bundle-monthly"] };
    case PRODUCT_IDS.bundle_yearly:
      return { plan: "bundle", billing_period: "yearly", price_chf: PRICES["bundle-yearly"] };
    default:
      return null;
  }
}

function statusFromSnapshot(snap: RcEntitlementSnapshot | null): SubscriptionStatus | null {
  const apps = snapshotAppsUnlocked(snap);
  if (!snap || apps.length === 0) return null;

  const meta = productMeta(snap.activeProductId);
  const isBundle = snapshotIsBundle(snap) || apps.length >= 2;
  return {
    plan: meta?.plan ?? (isBundle ? "bundle" : "single"),
    entitlement: isBundle ? "bundle" : "single_app",
    apps_unlocked: apps,
    billing_period: meta?.billing_period ?? null,
    price_chf: meta?.price_chf ?? null,
    expires_at: null,
  };
}

function previewStatus(plan: "single" | "bundle", period: "monthly" | "yearly", appSlug?: string): SubscriptionStatus {
  const apps = plan === "bundle" ? AVAILABLE_APP_SLUGS : appSlug ? [appSlug] : [];
  return {
    plan,
    entitlement: plan === "bundle" ? "bundle" : "single_app",
    apps_unlocked: apps,
    billing_period: period,
    price_chf: PRICES[`${plan}-${period}`],
    expires_at: null,
  };
}

async function readPreviewStatus(): Promise<SubscriptionStatus | null> {
  try {
    const raw = await AsyncStorage.getItem(PREVIEW_STATUS_KEY);
    return raw ? (JSON.parse(raw) as SubscriptionStatus) : null;
  } catch {
    return null;
  }
}

async function writePreviewStatus(status: SubscriptionStatus | null) {
  if (status) {
    await AsyncStorage.setItem(PREVIEW_STATUS_KEY, JSON.stringify(status));
  } else {
    await AsyncStorage.removeItem(PREVIEW_STATUS_KEY);
  }
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { isAuthed, user } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [rcEntitlements, setRcEntitlements] = useState<RcEntitlementSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isReviewer = user?.email?.toLowerCase() === REVIEWER_EMAIL;

  const refresh = useCallback(async () => {
    if (!isAuthed) {
      setStatus(null);
      setRcEntitlements(null);
      return;
    }
    if (isReviewer) {
      setStatus(reviewerStatus());
      setRcEntitlements(null);
      return;
    }

    const rcSnap = await rcGetEntitlements().catch(() => null);
    if (rcSnap) {
      setRcEntitlements(rcSnap);
      setStatus(statusFromSnapshot(rcSnap));
      return;
    }

    setRcEntitlements(null);
    setStatus(await readPreviewStatus());
  }, [isAuthed, isReviewer]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await refresh();
      setIsLoading(false);
    })();
  }, [refresh]);

  /**
   * Access rule for a specific app slug.
   *
   * Order of trust:
   *   1. RevenueCat live entitlements (only on native iOS build)
   *      → "clar.app" entitlement unlocks everything
   *      → "heim" entitlement unlocks clar·heim
   *      → "markt" entitlement unlocks clar·markt
   *   2. Local preview state (Web/Expo Go only, no backend).
   */
  const hasEntitlement = useCallback(
    (slug: string) => {
      if (isReviewer && AVAILABLE_APP_SLUGS.includes(slug)) return true;
      if (snapshotUnlocksApp(rcEntitlements, slug)) return true;
      return !!status?.apps_unlocked?.includes(slug);
    },
    [isReviewer, rcEntitlements, status]
  );

  const hasBundle =
    isReviewer ||
    snapshotIsBundle(rcEntitlements) ||
    status?.entitlement === "bundle" ||
    (status?.apps_unlocked ?? []).length >= 2;

  const purchase = useCallback(
    async (plan: "single" | "bundle", period: "monthly" | "yearly", appSlug?: string) => {
      if (isRevenueCatAvailable()) {
        const productId = productIdFor(plan, period);
        const outcome = await purchaseProduct(productId);
        if (!outcome.ok) {
          if (outcome.cancelled) return;
          if (outcome.productNotFound) {
            throw new Error(
              `IAP "${productId}" ist in App Store Connect noch nicht aktiv. Bitte Produkt anlegen, "Ready to Submit" stellen und im Sandbox/TestFlight erneut versuchen.`
            );
          }
          throw new Error(outcome.error ?? "Kauf fehlgeschlagen");
        }

        // Persist the live entitlement snapshot so the UI updates immediately.
        setRcEntitlements(outcome.entitlements);
        setStatus(statusFromSnapshot(outcome.entitlements));

        // Verify the right entitlement actually got granted.
        const e = outcome.entitlements;
        if (plan === "bundle") {
          const ok = e.clarApp || (e.heim && e.markt);
          if (!ok) {
            throw new Error(
              `Bundle gekauft, aber Entitlement nicht aktiv. RevenueCat sollte für ${productId} "clar.app" ODER ("heim" + "markt") freischalten.`
            );
          }
        } else {
          const slug = appSlug ?? "";
          const hit = e.clarApp || (slug === "heim" ? e.heim : slug === "markt" ? e.markt : false);
          if (!hit) {
            throw new Error(
              `Einzel-Abo gekauft, aber Entitlement für "${slug}" nicht aktiv. RevenueCat sollte für ${productId} das Entitlement "${slug}" (oder "clar.app") freischalten.`
            );
          }
        }
        return;
      }

      const s = previewStatus(plan, period, plan === "single" ? appSlug : undefined);
      await writePreviewStatus(s);
      setStatus(s);
    },
    []
  );

  const restore = useCallback(async () => {
    if (!isRevenueCatAvailable()) return;
    const snap = await rcRestore();
    if (!snap) return;
    setRcEntitlements(snap);
    setStatus(statusFromSnapshot(snap));
  }, []);

  const cancel = useCallback(async () => {
    // Apple subscriptions can only be cancelled in iOS Settings. For preview
    // mode this clears the local simulated status.
    await writePreviewStatus(null);
    setStatus(null);
    setRcEntitlements(null);
  }, []);

  return (
    <SubContext.Provider
      value={{
        status,
        rcEntitlements,
        isLoading,
        hasEntitlement,
        hasBundle,
        refresh,
        purchase,
        cancel,
        restore,
      }}
    >
      {children}
    </SubContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubContext);
  if (!ctx) throw new Error("useSubscription must be inside SubscriptionProvider");
  return ctx;
}
