# Agent-Briefings für clar·heim und clar·markt

> Ich (clar-bundle / iOS-Shell) kann **keine** Agenten in den anderen Repos
> direkt anstoßen. Bitte kopiere den jeweiligen Block unten **1 : 1** in
> das Emergent-Chat-Fenster des passenden Projekts.

---

## 🟢 Block A — Paste in **`Lautini-app/clar-heim`**

```
Hi! Bitte die folgende Änderung umsetzen — sie ist nötig damit die neue
iOS-Shell (clar-bundle v1.0.14) das Landing-Page-Flash vor clar·heim
verhindern kann.

KONTEXT
-------
Die Shell rendert ein volldeckendes grünes Brand-Overlay über dem
WebView, solange clar·heim noch lädt / route't. Bisher blendete die
Shell das Overlay nach einem fixen 1500 ms-Timer aus — dadurch sah der
User bei langsamem Netz für 0.3 – 0.5 s die Web-Landingpage durchblitzen.

Ab Shell-Version 1.0.14 wartet die Shell auf einen Handshake:
ein einmaliges postMessage `{type:"clar_ready"}` von clar·heim, sobald
clar·heim die SSO-Session konsumiert hat UND die erste echte App-Route
gemountet ist (z. B. `/heute`). Sobald die Shell die Message bekommt,
blendet sie das Overlay sofort ab → kein Flash mehr.

AUFGABE
-------
1) Lege `src/lib/shellBridge.ts` (oder ähnliches) an mit:

```ts
declare global {
  interface Window {
    clarShell?: { ready: () => void; post: (type: string, data?: unknown) => void };
    ReactNativeWebView?: { postMessage: (msg: string) => void };
  }
}

export function signalShellReady() {
  if (typeof window === 'undefined') return;
  if (window.clarShell?.ready) { window.clarShell.ready(); return; }
  if (window.ReactNativeWebView?.postMessage) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'clar_ready' }));
  }
}
```

2) Rufe `signalShellReady()` GENAU EIN MAL auf, und zwar:
   - NACHDEM `consumeShellSession()` durchgelaufen ist (Supabase setSession ok)
   - NACHDEM die erste echte App-Route (z. B. `/heute`) gemountet ist
   - NUR wenn `isEmbeddedInShell() === true`

   Konkret z. B. in der `/heute`-Route:
   ```ts
   useEffect(() => {
     if (isEmbeddedInShell()) signalShellReady();
   }, []);
   ```

   Wichtig: nicht in `App.tsx`/Root anrufen, sondern erst in der finalen
   Route — sonst feuert er bevor die Landing-Page wegredirected wurde.

3) Test im Browser (non-embedded): `isEmbeddedInShell()` ist false →
   `signalShellReady()` wird NICHT aufgerufen → Web-Flow unverändert.

REFERENZ
--------
Die volle Spec steht in `clar-bundle/memory/SSO_CONTRACT.md` Abschnitt B.2.
Falls Zugriff fehlt: hier sind die wichtigsten Punkte:
- Die Shell injiziert vor dem Content-Load `window.clarShell.ready()`
- Fallback: direkt `window.ReactNativeWebView.postMessage(JSON.stringify({type:'clar_ready'}))`
- Die Shell hat zusätzlich einen Fallback (Routen-Hint + 6 s Max-Timeout) —
  alte Builds funktionieren also weiter, aber mit Flash. Mit Handshake = 0 Flash.

ABNAHMEKRITERIEN
----------------
- [ ] `signalShellReady()` existiert und ist getypt
- [ ] Wird in der ersten echten Route via `useEffect` aufgerufen
- [ ] Nur aufgerufen wenn `isEmbeddedInShell()` true
- [ ] Im Browser kein neuer Console-Error / kein TS-Fehler
- [ ] (optional) console.log("[clar] shell ready signal sent") für Debugging
```

---

## 🟢 Block B — Paste in **`Lautini-app/clar-markt`**

```
Hi! Identische Änderung wie für clar·heim — bitte die folgende Brücke
zur iOS-Shell (clar-bundle v1.0.14) einbauen damit das Landing-Page-Flash
verschwindet.

KONTEXT
-------
Die Shell rendert über dem WebView ein grünes Brand-Overlay, bis clar·markt
fertig geroutet ist. Ohne expliziten Handshake wartet die Shell bis zu 6 s
oder bis sie eine bekannte In-App-Route in der URL erkennt — beides ist
suboptimal. User berichtet 0.5 s Flash der Landingpage vor jedem Öffnen.

Lösung: clar·markt sendet ein einmaliges postMessage `{type:"clar_ready"}`
an die Shell sobald (a) SSO-Session konsumiert ist und (b) die erste echte
In-App-Route (z. B. `/liste`, `/app`) gemountet ist.

AUFGABE
-------
1) `src/lib/shellBridge.ts` anlegen:

```ts
declare global {
  interface Window {
    clarShell?: { ready: () => void; post: (type: string, data?: unknown) => void };
    ReactNativeWebView?: { postMessage: (msg: string) => void };
  }
}

export function signalShellReady() {
  if (typeof window === 'undefined') return;
  if (window.clarShell?.ready) { window.clarShell.ready(); return; }
  if (window.ReactNativeWebView?.postMessage) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'clar_ready' }));
  }
}
```

2) In der ersten echten App-Route von clar·markt (vermutlich `/liste`
   oder `/app`) per `useEffect` aufrufen — aber nur wenn
   `isEmbeddedInShell() === true`:

   ```ts
   useEffect(() => {
     if (isEmbeddedInShell()) signalShellReady();
   }, []);
   ```

3) **WICHTIG**: clar·markt hatte laut Status der `SSO_CONTRACT.md` die
   `isEmbeddedInShell()` + `consumeShellSession()` Funktionen noch nicht
   implementiert (Tabelle Abschnitt 5). Falls das immer noch der Fall ist,
   bitte ZUERST diese Funktionen aus `SSO_CONTRACT.md` Abschnitt 2.A + 2.B
   einbauen, danach den `signalShellReady()`-Aufruf.

ABNAHMEKRITERIEN
----------------
- [ ] `isEmbeddedInShell()` vorhanden (siehe Spec 2.A)
- [ ] `consumeShellSession()` vorhanden und vor Auth-Guards aufgerufen (Spec 2.B)
- [ ] `signalShellReady()` vorhanden und in erster Route gefeuert
- [ ] Embedded-UI-Anpassungen (Spec 2.C): kein Stripe, keine Landingpage, kein Logout-Button
- [ ] Im Browser non-embedded: alles wie bisher (Stripe, Magic Link, …)
```

---

## 🟡 Bonus — Verification im clar-bundle (dieses Repo) nach Web-Updates

Nachdem die Web-Apps deployed sind, kannst du in der **iOS-Shell** prüfen,
dass der Handshake greift:

1. TestFlight-Build (Shell v1.0.14+) öffnen
2. App-Kachel antippen → Overlay sollte **sofort** verschwinden sobald der
   Web-Content fertig ist (< 100 ms statt der alten ~1500 ms / 0.5 s Flash)
3. Settings → Diagnose → Logs öffnen → es muss ein Log auftauchen wie:
   `[webview] overlay hide via clar_ready (337ms)`
   Wenn stattdessen `via route-hint` oder `via max-timeout` steht, ist der
   `signalShellReady()` Aufruf in der jeweiligen Web-App noch nicht aktiv.
