# Rutgers CAS SSO Guide

## Purpose

Document the hard-switch plan for replacing Supabase-backed authentication with Rutgers CAS for the native iOS app.

## Status

- not active today
- current production auth is still Supabase-backed
- target future direction is Rutgers CAS with backend-owned ScarletSpots sessions
- scope is iOS app only for now
- migration strategy is hard switch with fresh-start accounts

## Rutgers CAS environment notes

- Rutgers local CAS version: `CAS 6.5`
- Rutgers auth mechanisms noted in the help docs: `Kerberos` and `Duo`
- test login URL: `https://test-cas.rutgers.edu/login`
- production login URL: `https://cas.rutgers.edu/login`
- test CAS P2 validation URL: `https://test-cas.rutgers.edu/serviceValidate`
- production CAS P2 validation URL: `https://cas.rutgers.edu/serviceValidate`
- logout URLs exist for both test and production and should be reviewed during implementation
- default implementation assumption: use browser redirect to `/login` and server-side ticket validation via `/serviceValidate`

## Rutgers request process notes

- likely request type: `New Application/SP Integration`
- Rutgers expects formal CAS onboarding through the Enterprise CAS request form
- the request asks for separate test and production HTTPS application URLs
- the request appears oriented around backend/web callback endpoints, not a bundle-id-only native integration
- ScarletSpots should expect to provide backend-hosted CAS service/callback URLs for both test and production
- if ScarletSpots needs more than NetID, request explicit attribute release
- likely attributes to request:
  - `email`
  - possibly `name`
- Rutgers notes that extra attribute release may require additional approval from data custodians
- the form says to allow roughly two business days for request processing

## Target architecture

```text
iOS app
  -> backend auth start endpoint
  -> Rutgers CAS login in browser
  -> backend validates CAS ticket
  -> backend finds or creates local profile
  -> backend issues ScarletSpots access + refresh tokens
  -> iOS stores tokens in Keychain
  -> iOS uses ScarletSpots bearer token for API, websocket, and attestation flows
```

## Product decisions locked in

- replace Supabase auth completely, not phased
- iOS-only auth scope for now
- fresh start for accounts
- no Supabase fallback login
- no account linking or legacy identity migration
- Rutgers-only identity remains required

## Why this is feasible

- app data already lives in FastAPI + Postgres
- Supabase is mainly being used as the identity/session provider
- most backend routers already depend on local SQLAlchemy models, not Supabase tables
- replacing auth does not require rewriting parking, friends, occupancy, push, or forecast features

## What must change

### Backend

- add CAS auth start/callback flow
- validate Rutgers CAS tickets server-side
- issue ScarletSpots access and refresh tokens
- add refresh-session persistence and revocation
- replace Supabase JWT verification in:
  - HTTP auth dependencies
  - request auth middleware
  - websocket auth
  - attestation bootstrap
- remove:
  - Supabase client lifecycle bootstrapping
  - `/users/signup`
  - `/users/password-reset`
  - Supabase-backed account creation/deletion assumptions
- move attestation signing fallback off `SUPABASE_JWT_SECRET`

### iOS

- replace `SupabaseClient` usage in `AuthManager`
- remove password login, signup, and forgot-password flows
- add browser-based Rutgers SSO using `ASWebAuthenticationSession`
- persist ScarletSpots tokens in Keychain
- support backend token refresh on app restore and 401 recovery
- update signed-out UI to a single Rutgers SSO path

### Config

- remove runtime dependency on:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_JWT_SECRET`
  - related Supabase JWT env vars
- add new backend auth config for:
  - CAS base URL
  - CAS service/callback URL
  - ScarletSpots JWT signing secret
  - refresh token/session settings
- update iOS config validation to stop requiring Supabase values

## Required Rutgers work

Before implementation:

- submit the Rutgers Enterprise CAS request
- confirm CAS is the correct Rutgers SSO technology for this app
- obtain approved callback/service URLs
- confirm mobile redirect expectations for native app login
- collect any Rutgers-specific operational requirements
- provide HTTPS test and production backend URLs in the request
- decide which user attributes ScarletSpots needs beyond NetID before submitting

## App behavior after the switch

- user taps `Sign in with Rutgers`
- app opens Rutgers SSO in the browser
- successful CAS login returns to ScarletSpots
- backend creates a new local account if needed
- app receives ScarletSpots tokens and proceeds normally
- all authenticated API, websocket, and attestation flows use the ScarletSpots token
- sign out clears local auth state, push registration state, and per-user caches
- the native app should use browser-based auth through `ASWebAuthenticationSession`, not in-app password collection

## Data and migration policy

- this is a fresh start
- old Supabase-linked identities are not migrated
- users must sign in again through Rutgers CAS
- newly authenticated users receive backend-owned UUID identities
- existing social/session/profile data tied to old Supabase identities is not preserved under this plan

## Testing checklist

### Backend

- CAS callback success issues tokens
- invalid CAS callback is rejected
- refresh token rotation works
- revoked refresh token can no longer refresh
- protected REST endpoints accept ScarletSpots JWTs
- websocket auth accepts ScarletSpots JWTs
- attestation session creation works with ScarletSpots JWTs

### iOS

- signed-out flow shows only Rutgers SSO
- login roundtrip returns to app correctly
- cold launch restores session from Keychain
- expired access token refreshes automatically
- logout clears local auth/session state cleanly

### End-to-end

Authenticated user can still:

- fetch profile
- update permit preferences
- register push token
- start and end parking sessions
- use friends, favorites, websocket, and notification features

## Re-check before implementation

- final CAS callback shape
- token lifetime policy
- refresh-token storage model
- app URL scheme vs universal link choice
- logout semantics with Rutgers CAS SSO session
- whether any remaining Supabase code is still needed outside auth
- whether Rutgers wants `serviceValidate`, `p3/serviceValidate`, or another validation flavor for this app
- final attribute release approval for `email` and any profile fields beyond NetID

Last reviewed: 2026-04-28
