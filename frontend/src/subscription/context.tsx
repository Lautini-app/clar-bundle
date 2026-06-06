import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, SubscriptionStatus } from "../api/client";
import { useAuth } from "../auth/context";

type SubState = {
  status: SubscriptionStatus | null;
  isLoading: boolean;
  hasEntitlement: (appSlug: string) => boolean;
  hasBundle: boolean;
  refresh: () => Promise<void>;
  purchase: (plan: "single" | "bundle", period: "monthly" | "yearly", appSlug?: string) => Promise<void>;
  cancel: () => Promise<void>;
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
      const s = await api.purchase(plan, period, appSlug);
      setStatus(s);
    },
    []
  );

  const cancel = useCallback(async () => {
    await api.cancel();
    setStatus(null);
  }, []);

  return (
    <SubContext.Provider
      value={{ status, isLoading, hasEntitlement, hasBundle, refresh, purchase, cancel }}
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
