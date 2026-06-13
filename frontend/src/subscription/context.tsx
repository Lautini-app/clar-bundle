import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, SubscriptionStatus } from "../api/client";
import { useAuth } from "../auth/context";
import {
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

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { isAuthed } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [rcEntitlements, setRcEntitlements] = useState<RcEntitlementSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isAuthed) {
      setStatus(null);
      setRcEntitlements(null);
      return;
    }
    // Pull local shell state and RevenueCat entitlements in parallel.
    const [localStatus, rcSnap] = await Promise.all([
      api.subscriptionStatus().catch(() => null),
      rcGetEntitlements().catch(() => null),
    ]);
    setStatus(localStatus);
    if (rcSnap) setRcEntitlements(rcSnap);
  }, [isAuthed]);

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
   *   2. Local shell mirror (fallback for Web/Expo Go preview, and for tracking
   *      which app the user picked in a 1-app subscription).
   */
  const hasEntitlement = useCallback(
    (slug: string) => {
      if (snapshotUnlocksApp(rcEntitlements, slug)) return true;
      return !!status?.apps_unlocked?.includes(slug);
    },
    [rcEntitlements, status]
  );

  const hasBundle =
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
      }

      // Local mirror — also tracks the chosen app_slug for single-plan users
      // (since RC alone may grant "clar.app" without saying which app the user picked).
      const s = await api.purchase(plan, period, plan === "single" ? appSlug : undefined);
      setStatus(s);
    },
    []
  );

  const restore = useCallback(async () => {
    if (!isRevenueCatAvailable()) return;
    const snap = await rcRestore();
    if (!snap) return;
    setRcEntitlements(snap);

    // Mirror restored entitlements locally so apps_unlocked stays in sync.
    const apps = snapshotAppsUnlocked(snap);
    if (apps.length === 2 || snap.clarApp) {
      const s = await api.purchase("bundle", "yearly").catch(() => null);
      if (s) setStatus(s);
    } else if (apps.length === 1) {
      const s = await api.purchase("single", "yearly", apps[0]).catch(() => null);
      if (s) setStatus(s);
    }
  }, []);

  const cancel = useCallback(async () => {
    // Apple subscriptions can only be cancelled in iOS Settings.
    // We just clear our local mirror so the UI reflects the state immediately.
    await api.cancel();
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
