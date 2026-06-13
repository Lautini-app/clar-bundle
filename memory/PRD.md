# clar by lautini — PRD

## Übersicht
Native iOS Shell-App für den App Store, gebaut mit Expo (React Native), Supabase Auth und RevenueCat. Die App-Liste liegt statisch im Frontend unter `frontend/src/api/apps.ts`.

## Aktueller Status — Phasen A, B, C komplett (Code-seitig)

### ✅ Phase A — Architektur
- Onboarding-Flow: Welcome → Apple Sign-In → direkt zu Kacheln (kein select-apps, kein plan-Onboarding)
- Hauptscreen: 3 Sektionen (Aktiv / Wähle / Demnächst)
- Paywall als Modal-Sheet pro Kachel-Tap
- WebView mit URL-Hash-Token, `clar_embedded=1`, `__CLAR_EMBEDDED__`, shared cookies
- Logout mit Supabase + AsyncStorage + WebView Cookie cleanup
- SSO Contract dokumentiert (`/app/memory/SSO_CONTRACT.md`)

### ✅ Phase B — Apple Sign-In via Supabase
- `expo-apple-authentication` + `@supabase/supabase-js` integriert
- `src/lib/supabase.ts` + Session-Persistenz in AsyncStorage
- Native iOS: `AppleAuthentication.signInAsync` → `supabase.auth.signInWithIdToken({provider:'apple'})`
- Supabase Session Tokens werden gecached für SSO-Handoff an WebViews
- Apple-Konfig: Bundle ID `ch.lautini.clar`, Team ID `BP3882583C`, Services ID `ch.lautini.clar.signin`

### ✅ Phase C — RevenueCat IAPs
- `react-native-purchases` integriert (iOS only, no-op auf Web/Android)
- 4 Produkt-IDs (App Store Connect / RevenueCat): `ch.lautini.clar.1app.monthly`, `ch.lautini.clar.1app.yearly`, `ch.lautini.clar.2apps.monthly`, `ch.lautini.clar.2apps.yearly`
- 3 Entitlements (RevenueCat-Konfig): `heim`, `markt`, `clar.app` — Zugriffsregel: `clar.app` ist all-access, sonst per-App-Match
- "Käufe wiederherstellen" Button in Settings (App Store Pflicht)
- `Purchases.logIn(user_id)` an Supabase-User gebunden
- Diagnose-Sektion in Settings zeigt Live-Status (Build-Typ, RC-Status, Entitlements)
- Web-Preview-Fallback: lokaler AsyncStorage-Mock ohne Backend

## Was vor App Store Submit zu tun ist (User-Tasks)

### A. Supabase Dashboard
1. Auth → Providers → **Apple** aktivieren
2. Client IDs: `ch.lautini.clar.signin,ch.lautini.clar`
3. Team ID: `BP3882583C`, Key ID: `ARPA2UZCKS` (oder rotiert), `.p8` Inhalt einfügen
4. Apple Developer → Services ID Return URL: `https://cgwpzpnklxphqxlixtva.supabase.co/auth/v1/callback`

### B. App Store Connect
1. App `clar by lautini` mit Bundle ID `ch.lautini.clar` (✅ erstellt)
2. **4 IAP-Produkte anlegen:**
   - `ch.lautini.clar.1app.monthly` (CHF 4 Auto-renewable, Subscription Group `clar`)
   - `ch.lautini.clar.1app.yearly` (CHF 30)
   - `ch.lautini.clar.2apps.monthly` (CHF 6)
   - `ch.lautini.clar.2apps.yearly` (CHF 50)
3. Sandbox Tester Account anlegen für TestFlight-Tests
4. Banking & Tax (✅ hinterlegt)

### C. RevenueCat Dashboard
1. App `clar` anlegen mit Bundle ID `ch.lautini.clar`
2. iOS API Key (✅ vorhanden: `appl_BwjkHM...`)
3. App Store Connect Shared Secret hochladen
4. **2 Entitlements:** `single_app`, `bundle`
5. **Offering `default`** mit 4 Packages → mit Apple-IAP-IDs verknüpfen
6. Webhook URL optional, falls später wieder Server-Side-Validation benötigt wird

### D. Web-Apps (separate Emergent-Projekte)
- `clar.heim`: SSO_CONTRACT.md implementieren — `isEmbedded`-Check teilweise vorhanden, vervollständigen
- `clar.markt`: SSO_CONTRACT.md komplett implementieren

### E. Native iOS Build via Emergent Publish
- "Publish" Button oben rechts → iOS Build generieren
- TestFlight Upload
- Test mit Sandbox Apple ID
- App Store Review submission

## Frontend App-Katalog
- `frontend/src/api/apps.ts` — statischer Katalog für Home, Paywall und WebView-Routing
- Keine Shell-Backend- oder `/api/*`-Aufrufe mehr im Frontend

## Erweiterbarkeit
Neue App hinzufügen: Eintrag in `CLAR_APPS` in `frontend/src/api/apps.ts` setzen mit `available: true`. Erscheint automatisch in Home, Paywall und WebView-Routing. Bundle-Preis bleibt konstant.

## MOCK Hinweise
- **Web-Preview / Expo Go**: Apple Sign-In = MOCK, RevenueCat = lokaler Preview-Status, SSO-Tokens = leer
- **Nativer iOS-Build**: alles real
