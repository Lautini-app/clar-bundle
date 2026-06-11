import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useEffect, useRef } from "react";

/**
 * Inline safe log helper — NO external module dependency. See
 * src/auth/context.tsx for rationale (avoids "Property 'diag' doesn't exist"
 * crashes from Metro/Hermes bundling edge-cases on iOS native builds).
 */
function safeLog(msg: string): void {
  try {
    // eslint-disable-next-line no-console
    if (typeof console !== "undefined") console.log(`[deeplink] ${msg}`);
  } catch {
    /* noop */
  }
}

/**
 * Map of Universal-Link hostnames → in-shell app slug.
 * When the user taps a https://clar.heim.lautini.ch/... link anywhere
 * (Safari, Mail, Messages, WhatsApp, etc.) iOS routes it to our app and
 * we open the matching WebView, forwarding the original path so the
 * embedded web app can deep-link to the right screen.
 *
 * Apple's required apple-app-site-association file must be reachable
 * at:
 *   https://clar.heim.lautini.ch/.well-known/apple-app-site-association
 *   https://clar.markt.lautini.ch/.well-known/apple-app-site-association
 *
 * Both files must serve:
 *   {
 *     "applinks": {
 *       "details": [{
 *         "appIDs": ["BP3882583C.ch.lautini.clar"],
 *         "components": [{ "/": "/*" }]
 *       }]
 *     }
 *   }
 * served as Content-Type: application/json, status 200, no redirects.
 */
const UNIVERSAL_LINK_HOSTS: Record<string, "heim" | "markt"> = {
  "clar.heim.lautini.ch": "heim",
  "clar.markt.lautini.ch": "markt",
};

function routeForUrl(rawUrl: string): { slug: "heim" | "markt"; path: string } | null {
  try {
    const u = new URL(rawUrl);
    const slug = UNIVERSAL_LINK_HOSTS[u.hostname];
    if (!slug) return null;
    // Preserve full path + query so the embedded web app can deep-link.
    const path = `${u.pathname}${u.search}${u.hash}`;
    return { slug, path };
  } catch {
    return null;
  }
}

/**
 * Hook installed in the root layout. Listens for:
 * - Cold-start URL (app opened from a link tap when killed)
 * - Hot URLs (app already running)
 *
 * Routes incoming Universal Links to /(main)/app/[slug] with a `deeplink`
 * param the WebView screen reads to forward the path to the WebView.
 */
export function useUniversalLinks() {
  const handled = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url || handled.current.has(url)) return;
      handled.current.add(url);
      const match = routeForUrl(url);
      if (!match) {
        safeLog(`[deeplink] ignored (not a clar host): ${url}`);
        return;
      }
      safeLog(`[deeplink] ${url} → /(main)/app/${match.slug}?deeplink=${match.path}`);
      router.replace({
        pathname: "/(main)/app/[slug]",
        params: { slug: match.slug, deeplink: match.path },
      });
    };

    // Cold start
    Linking.getInitialURL()
      .then((u) => handle(u))
      .catch((e) => safeLog(`[deeplink] getInitialURL failed: ${String(e)}`));

    // Hot URLs (foreground)
    const sub = Linking.addEventListener("url", (event) => handle(event.url));
    return () => sub.remove();
  }, []);
}
