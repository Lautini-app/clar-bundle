# clar by lautini — PRD

## Übersicht
Native iOS Shell-App für den App Store, gebaut mit Expo (React Native) + FastAPI/MongoDB. Erweiterbarer App-Hub: neue clar·Apps werden über die Backend-Konfiguration (`/api/apps`) hinzugefügt — ohne App Store Update.

## Aktueller Status (MVP komplett, Vorschau-tauglich)
- ✅ Splash & Onboarding (Welcome → Sign-In → App-Auswahl → Abo)
- ✅ Backend: extensible Apps-Katalog (heim, markt, lern, zeit) via `/api/apps`
- ✅ Auth: **MOCK Sign in with Apple** (Backend mintet JWT). Bereit für Supabase + expo-apple-authentication im nativen Build
- ✅ Subscriptions: **MOCK RevenueCat** mit Plänen Einzel (CHF 4/Mt, CHF 30/Jahr) und Bundle (CHF 6/Mt, CHF 50/Jahr)
- ✅ Hauptscreen: Meine Apps + Entdecken, mit Lock/Unlock je Entitlement
- ✅ WebView-Wrapper pro App mit MOCK SSO Token-Handoff via `postMessage`
- ✅ Settings: Konto, Abo, Apps verwalten, Abmelden, Abo-Kündigung
- ✅ Design: Brand-Grün #2E5C3E, ruhiges Layout, neurodivers-freundlich
- ✅ iOS app.json: bundleIdentifier `ch.lautini.clar`, `usesAppleSignIn: true`

## Was vor Native iOS Build noch zu tun ist
1. **Supabase Apple Sign-In** anschliessen (Code in `/app/frontend/src/auth/context.tsx` durch expo-web-browser + supabase-js Flow ersetzen — Playbook liegt vor)
2. **RevenueCat** native SDK installieren (`react-native-purchases`), Configure in `_layout.tsx`, Paywall via `presentPaywallIfNeeded`. Backend `/subscription/purchase` durch RevenueCat Webhook ersetzen
3. **Apple Developer**: App ID + Sign in with Apple Capability + Services ID, Supabase Apple Provider konfigurieren
4. **App Store Connect**: 4 IAP-Produkte anlegen (single_monthly_chf_4, single_yearly_chf_30, bundle_monthly_chf_6, bundle_yearly_chf_50)
5. **EAS Build** für iOS dev client + Production
6. **Web-Apps clar.heim & clar.markt** müssen `window.addEventListener('message')` für SSO-Token implementieren

## Backend-Endpunkte
- `GET /api/apps` — Katalog (öffentlich)
- `POST /api/auth/apple` — Sign in (mock)
- `GET /api/auth/me`
- `POST /api/user/selected-apps`
- `GET /api/subscription/status`
- `POST /api/subscription/purchase` (mock)
- `POST /api/subscription/cancel`
- `GET /api/sso/token` — kurzfristiges SSO-Token für WebViews

## Erweiterbarkeit
Neue App hinzufügen: Eintrag in `APPS_CATALOG` in `/app/backend/server.py` setzen mit `available: true`. Erscheint automatisch in Onboarding und Home.
