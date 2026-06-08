# SSO + Embedded Contract — clar Shell ↔ clar·Web-Apps

**Audience:** Agent/Maintainer von `Lautini-app/clar-heim` und `Lautini-app/clar-markt`.

**Goal:** Wenn eine Web-App in der iOS-Shell läuft, soll sie (a) erkennen, dass sie eingebettet ist, (b) den Supabase-Login vom Shell akzeptieren, (c) keinen Stripe/Pricing-Flow zeigen.

---

## 1. Wie die Shell die Web-App lädt

URL-Format (Schema seit Shell v1.0.8):

```
https://clar.heim.lautini.ch/?clar_embedded=1#access_token=<JWT>&refresh_token=<JWT>&type=clar_sso&clar_embedded=1
```

**Zwei Signale, gleicher Zweck:**

| Signal | Sichtbar wann? | Zweck |
|---|---|---|
| Query `?clar_embedded=1` | **Sofort** beim ersten Server-Render | Landingpage/Stripe-UI gar nicht erst rendern |
| Hash `#access_token=…&refresh_token=…` | Erst client-side nach JS-Hydration | Supabase-Session setzen (Tokens niemals an Server senden) |
| Hash `#clar_embedded=1` | Erst client-side | Fallback wenn Web-App nur Hash liest |

Plus folgendes injiziert die Shell vor dem Content-Load:

```js
window.__CLAR_EMBEDDED__ = true;
window.__CLAR_SHELL_VERSION__ = '1.0.0';
document.documentElement.setAttribute('data-clar-embedded', '1');
```

Plus User-Agent enthält `clar-shell/1.0.0`.

⚠️ **Sicherheitsregel:** Tokens dürfen **NIE** als Query-Parameter geschickt werden — sie würden in Server-Access-Logs landen. Nur Hash für Tokens, immer.

---

## 2. Was die Web-App tun muss

### A) `isEmbedded` detecten (5 Signale, beliebige Kombination — **Query-Param wird zuerst geprüft**)
```ts
export function isEmbeddedInShell(): boolean {
  if (typeof window === 'undefined') return false;
  const query = new URLSearchParams(window.location.search);
  // Cache the marker so SPA route changes keep working after the URL is cleaned up.
  if (query.get('clar_embedded') === '1') {
    try { sessionStorage.setItem('clar_embedded', '1'); } catch {}
    return true;
  }
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('clar_embedded') === '1') {
    return true;
  }
  const hash = new URLSearchParams(window.location.hash.slice(1));
  return (
    hash.get('clar_embedded') === '1' ||
    (window as any).__CLAR_EMBEDDED__ === true ||
    document.documentElement.getAttribute('data-clar-embedded') === '1' ||
    /clar-shell\//.test(navigator.userAgent)
  );
}
```

**Wichtig:** Der **Query-Parameter-Check muss VOR jeglichem Routing/Auth-Guard** in `main.tsx` (oder `_app.tsx`) laufen, sonst rendert die Landingpage einen Frame lang.

### B) Supabase-Session aus dem URL-Hash setzen
Direkt beim App-Bootstrap (in `main.tsx` oder einer Root-Route), **bevor** Auth-Guards laufen:

```ts
import { supabase } from './lib/supabase';

async function consumeShellSession() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  if (hash.get('type') !== 'clar_sso') return;
  const access_token = hash.get('access_token');
  const refresh_token = hash.get('refresh_token');
  if (!access_token || !refresh_token) return;

  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) {
    console.error('[clar-sso] setSession failed', error);
    return;
  }
  // remove tokens from URL but keep clar_embedded marker
  const url = new URL(window.location.href);
  url.hash = 'clar_embedded=1';
  window.history.replaceState({}, '', url.toString());
}

await consumeShellSession();
```

### C) Embedded-Mode UI-Anpassungen
| Wenn `isEmbedded === true` | Wirkung |
|---|---|
| Stripe Checkout Buttons | **Nicht mounten** |
| `/pricing` Route | Auf `/` redirecten oder leere Page |
| Magic-Link Login-Screen | **Nicht anzeigen** wenn schon authed (oder neuen "Bitte in clar-App neu einloggen"-Hinweis) |
| Marketing-/Landingpage | **Nicht anzeigen** wenn embedded — direkt in App-Content |
| `<a target="_blank">` Links | Mit Bedacht — öffnen Safari extern, User verliert Shell-Kontext |
| App-Logout-Button | **Verstecken** — Logout läuft nur über Shell-Settings |

---

## 3. Erwartetes Verhalten — End-to-End

```
1. User öffnet iOS Shell
2. User tippt auf clar·heim Kachel
3. WebView lädt: https://clar.heim.lautini.ch/#clar_embedded=1&access_token=...
4. clar·heim consumed die Session, setSession() → User ist eingeloggt
5. URL wird auf https://clar.heim.lautini.ch/#clar_embedded=1 aufgeräumt
6. clar·heim startet im Embedded-Mode → keine Pricing-Page, kein Stripe
7. User nutzt die App ganz normal
8. User tippt Shell-Back-Button → zurück zur Kachel-Übersicht
   (Supabase-Session bleibt im WebView-Cookie persistiert)
9. Beim nächsten Tap auf Kachel: WebView lädt mit frischem Token-Hash —
   setSession() refresht falls nötig
10. User logged sich in Shell-Settings aus → Shell ruft CookieManager.clearAll()
    → beim nächsten Öffnen muss Web-App wieder Token aus Hash konsumieren
    (oder zeigt Login wenn kein Hash kommt)
```

---

## 4. Test-Checkliste (vor Merge in clar·heim/clar·markt)

- [ ] `isEmbeddedInShell()` returnt `true` wenn `#clar_embedded=1` im Hash
- [ ] `isEmbeddedInShell()` returnt `true` wenn `__CLAR_EMBEDDED__ === true`
- [ ] `consumeShellSession()` setzt Supabase Session und entfernt Tokens aus URL
- [ ] `/pricing` Route ist im Embedded-Mode nicht erreichbar
- [ ] Stripe-Checkout startet im Embedded-Mode NICHT
- [ ] Im Browser (non-embedded) funktioniert alles wie bisher (Stripe + Magic Link)
- [ ] Logout-Button ist im Embedded-Mode versteckt
- [ ] Marketing-Landingpage übersprungen wenn embedded und authed

---

## 5. Status pro Web-App

| App | isEmbedded | consumeShellSession | UI-Anpassungen |
|---|---|---|---|
| clar·heim | ✅ vorhanden (laut User) | ❓ prüfen | ❓ prüfen |
| clar·markt | ❌ noch nicht implementiert | ❌ | ❌ |

**Action:** Beim nächsten Agent-Run in `Lautini-app/clar-heim` und `Lautini-app/clar-markt` diese Spec implementieren. Empfehlung: diese Datei einfach als Kontext an den Agent geben.

---

## 6. Backend-Notiz (für Shell-Side)

Damit die Shell Schritt 3 ausführen kann, muss sie nach Apple Sign-In via Supabase die echten `access_token`/`refresh_token` der Supabase-Session in AsyncStorage cachen:

```ts
// In src/auth/context.tsx nach signInWithIdToken({ provider: 'apple', token }):
await AsyncStorage.setItem('clar.supabase.access_token', data.session.access_token);
await AsyncStorage.setItem('clar.supabase.refresh_token', data.session.refresh_token);
```

Das passiert in **Phase B** (sobald `expo-apple-authentication` + `@supabase/supabase-js` integriert sind). Aktuell sind die Tokens leer — die Shell sendet nur `#clar_embedded=1` (Web-App fällt dann zurück auf normalen Login, was OK ist für den Übergang).

---

## 7. Shared Supabase-Projekt

- **Supabase URL:** `https://cgwpzpnklxphqxlixtva.supabase.co`
- **Verwendung:** Shell + clar·heim + clar·markt (alle nutzen dieselben Users)
- **Anon Key:** liegt in jedem Projekt einzeln (öffentlich, kein Geheimnis)
