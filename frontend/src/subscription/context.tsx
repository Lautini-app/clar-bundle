import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, SubscriptionStatus } from "../api/client";
import { useAuth } from "../auth/context";
import {
  purchaseProduct,
  productIdFor,
  restorePurchases as rcRestore,
  isRevenueCatAvailable,
} from "../lib/revenuecat";

type SubState = {
  status: SubscriptionStatus | null;
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
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isAuthed) {
      setStatus(null);
      return;
    }
    try {
      const s = await api.subscriptionStatus();
      setStatus(s);
    } catch {
      setStatus(null);
    }
  }, [isAuthed]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await refresh();
      setIsLoading(false);
    })();
  }, [refresh]);

  const hasBundle = status?.entitlement === "bundle";
  const hasEntitlement = useCallback(
    (slug: string) => !!status?.apps_unlocked?.includes(slug),
    [status]
  );

  const purchase = useCallback(
    async (plan: "single" | "bundle", period: "monthly" | "yearly", appSlug?: string) => {
      if (isRevenueCatAvailable()) {
        // Real RevenueCat / Apple IAP flow (native iOS build only)
        const productId = productIdFor(plan, period);
        const outcome = await purchaseProduct(productId);
        if (!outcome.ok) {
          if (outcome.cancelled) return;
          if (outcome.productNotFound) {
            throw new Error(
              `IAP "${productId}" ist in App Store Connect noch nicht aktiv. Bitte Produkt anlegen, "Ready to Submit" stellen und im Sandbox/TestFlight nochmal versuchen.`
            );
          }
          throw new Error(outcome.error ?? "Kauf fehlgeschlagen");
        }
        const grantedBundle = outcome.hasBundle;
        const grantedSingle = outcome.hasSingleApp;
        if (plan === "bundle" && !grantedBundle) {
          throw new Error("Bundle-Entitlement nicht erhalten");
        }
        if (plan === "single" && !grantedSingle && !grantedBundle) {
          throw new Error("Single-Entitlement nicht erhalten");
        }
      }
      // Record the purchase on shell backend.
      // On native iOS this runs AFTER the real Apple charge succeeded.
      // On web/Expo Go this is the only path (mock entitlement for preview).
      const s = await api.purchase(plan, period, plan === "single" ? appSlug : undefined);
      setStatus(s);
    },
    []
  );

  const restore = useCallback(async () => {
    if (!isRevenueCatAvailable()) return;
    const snap = await rcRestore();
    if (!snap) return;
    if (snap.hasBundle) {
      const s = await api.purchase("bundle", "yearly");
      setStatus(s);
    } else if (snap.hasSingleApp) {
      await refresh();
    }
  }, [refresh]);

  const cancel = useCallback(async () => {
    // Local-only cancellation. Real Apple subscriptions can only be cancelled
    // via iOS Settings → Apple ID → Subscriptions. We just clear our mirror.
    await api.cancel();
    setStatus(null);
  }, []);

  return (
    <SubContext.Provider
      value={{ status, isLoading, hasEntitlement, hasBundle, refresh, purchase, cancel, restore }}
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
