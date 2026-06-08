/**
 * Runtime diagnostics for the paywall / IAP / SSO stack.
 *
 * Visible in Settings → "Diagnose" so the user can verify on a real
 * TestFlight device that the new build actually loaded the fixes:
 * RC initialised, native build detected, env keys present.
 *
 * No secrets are exposed (only key prefixes).
 */
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { isNativeBuild, isRevenueCatAvailable, getEntitlements } from "./revenuecat";

export type DiagItem = { label: string; value: string; ok: boolean };

/**
 * Lightweight in-memory log buffer for debugging in production builds where
 * console output is not visible. Last 50 entries are surfaced in the
 * Diagnostics screen so the user can copy them if something misbehaves.
 */
const LOG_BUFFER: { ts: number; msg: string }[] = [];
const LOG_LIMIT = 50;

export const diag = {
  log(msg: string) {
    LOG_BUFFER.push({ ts: Date.now(), msg });
    if (LOG_BUFFER.length > LOG_LIMIT) LOG_BUFFER.shift();
    if (typeof console !== "undefined") console.log(`[diag] ${msg}`);
  },
  recent(): { ts: number; msg: string }[] {
    return LOG_BUFFER.slice();
  },
};

function mask(value: string | undefined | null): string {
  if (!value) return "—";
  if (value.length <= 10) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)} (${value.length})`;
}

export async function getDiagnostics(): Promise<DiagItem[]> {
  const execEnv = Constants.executionEnvironment ?? "unknown";
  const inExpoGo = execEnv === ExecutionEnvironment.StoreClient;
  const native = isNativeBuild();
  const rcKey = process.env.EXPO_PUBLIC_RC_IOS_API_KEY ?? "";
  const sbUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  const sbKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const rcAvailable = isRevenueCatAvailable();

  // Live entitlement snapshot — only meaningful on native build.
  const ents = rcAvailable ? await getEntitlements() : null;

  return [
    { label: "Plattform", value: Platform.OS, ok: true },
    { label: "Build-Typ", value: execEnv, ok: !inExpoGo },
    { label: "Native iOS Build", value: native ? "ja" : "nein", ok: native },
    { label: "RevenueCat aktiv", value: rcAvailable ? "ja" : "nein", ok: rcAvailable },
    { label: "RC API Key", value: mask(rcKey), ok: !!rcKey && rcKey.startsWith("appl_") },
    { label: "Entitlement: heim", value: ents?.heim ? "aktiv" : "—", ok: !!ents?.heim },
    { label: "Entitlement: markt", value: ents?.markt ? "aktiv" : "—", ok: !!ents?.markt },
    { label: "Entitlement: clar.app", value: ents?.clarApp ? "aktiv" : "—", ok: !!ents?.clarApp },
    { label: "Supabase URL", value: sbUrl ? new URL(sbUrl).host : "—", ok: !!sbUrl },
    { label: "Supabase Anon Key", value: mask(sbKey), ok: !!sbKey },
    { label: "App-Version", value: Constants.expoConfig?.version ?? "—", ok: true },
  ];
}
