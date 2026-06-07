# clar by lautini — PRD

## Übersicht
Native iOS Shell-App für den App Store, gebaut mit Expo (React Native) + FastAPI/MongoDB. Erweiterbarer App-Hub: neue clar·Apps werden über die Backend-Konfiguration (`/api/apps`) hinzugefügt — ohne App Store Update.

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
- Native iOS: `AppleAuthentication.signInAsync` → `supabase.auth.signInWithIdToken({provider:'apple'})` → Shell-Backend mint Shell-JWT
- Backend `/api/auth/apple` verifiziert Supabase access_token gegen `/auth/v1/user`
- Supabase Session Tokens werden gecached für SSO-Handoff an WebViews
- Apple-Konfig: Bundle ID `ch.lautini.clar`, Team ID `BP3882583C`, Services ID `ch.lautini.clar.signin`

### ✅ Phase C — RevenueCat IAPs
- `react-native-purchases` integriert (iOS only, no-op auf Web/Android)
- 4 Produkt-IDs gemappt: `clar_single_monthly`, `clar_single_yearly`, `clar_bundle_monthly`, `clar_bundle_yearly`
- 2 Entitlements: `single_app`, `bundle`
- "Käufe wiederherstellen" Button in Settings (App Store Pflicht)
- `Purchases.logIn(user_id)` an Supabase-User gebunden
- Web-Preview-Fallback: Backend-Mock-Purchase funktioniert weiterhin

## Was vor App Store Submit zu tun ist (User-Tasks)

### A. Supabase Dashboard
1. Auth → Providers → **Apple** aktivieren
2. Client IDs: `ch.lautini.clar.signin,ch.lautini.clar`
3. Team ID: `BP3882583C`, Key ID: `ARPA2UZCKS` (oder rotiert), `.p8` Inhalt einfügen
4. Apple Developer → Services ID Return URL: `https://cgwpzpnklxphqxlixtva.supabase.co/auth/v1/callback`

### B. App Store Connect
1. App `clar by lautini` mit Bundle ID `ch.lautini.clar` (✅ erstellt)
2. **4 IAP-Produkte anlegen:**
   - `clar_single_monthly` (CHF 4 Auto-renewable, Subscription Group `clar`)
   - `clar_single_yearly` (CHF 30)
   - `clar_bundle_monthly` (CHF 6)
   - `clar_bundle_yearly` (CHF 50)
3. Sandbox Tester Account anlegen für TestFlight-Tests
4. Banking & Tax (✅ hinterlegt)

### C. RevenueCat Dashboard
1. App `clar` anlegen mit Bundle ID `ch.lautini.clar`
2. iOS API Key (✅ vorhanden: `appl_BwjkHM...`)
3. App Store Connect Shared Secret hochladen
4. **2 Entitlements:** `single_app`, `bundle`
5. **Offering `default`** mit 4 Packages → mit Apple-IAP-IDs verknüpfen
6. Webhook URL (optional): Shell-Backend für Server-Side-Validation

### D. Web-Apps (separate Emergent-Projekte)
- `clar.heim`: SSO_CONTRACT.md implementieren — `isEmbedded`-Check teilweise vorhanden, vervollständigen
- `clar.markt`: SSO_CONTRACT.md komplett implementieren

### E. Native iOS Build via Emergent Publish
- "Publish" Button oben rechts → iOS Build generieren
- TestFlight Upload
- Test mit Sandbox Apple ID
- App Store Review submission

## Backend-Endpunkte
- `GET /api/apps` — Katalog (öffentlich)
- `POST /api/auth/apple` — Sign in via Supabase token verification
- `GET /api/auth/me`
- `POST /api/user/selected-apps` (legacy, nicht mehr verwendet)
- `GET /api/subscription/status`
- `POST /api/subscription/purchase` (records purchase nach RC success)
- `POST /api/subscription/cancel`
- `GET /api/sso/token` — Shell-JWT für legacy postMessage

## Erweiterbarkeit
Neue App hinzufügen: Eintrag in `APPS_CATALOG` in `/app/backend/server.py` setzen mit `available: true`. Erscheint automatisch in Onboarding und Home. Bundle-Preis bleibt konstant.

## MOCK Hinweise
- **Web-Preview / Expo Go**: Apple Sign-In = MOCK, RevenueCat = MOCK (Backend-Bypass), SSO-Tokens = leer
- **Nativer iOS-Build**: alles real
