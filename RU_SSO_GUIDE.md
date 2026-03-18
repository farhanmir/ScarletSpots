# Rutgers SSO Guide (Deprecated)

This document is retained for historical context.

## Status

The previous Rutgers CAS SSO direction is no longer the primary auth plan.

ScarletSpots now standardizes on Keycloak for identity and token issuance.

## What Changed

Previous approach:

- mobile redirects to Rutgers CAS
- backend validates CAS ticket
- backend issues local JWT

Current approach:

- mobile authenticates against Keycloak (OIDC)
- backend validates Keycloak JWT via issuer + JWKS
- backend admin flows (signup/reset) use Keycloak Admin API

## Why Keycloak

- supports self-hosting and portability
- avoids dependency on managed auth pricing constraints
- provides flexible realm/client/role management
- aligns with fully dockerized deployment and recovery strategy

## Rutgers Email Restriction

Rutgers domain restrictions remain enforced in backend business logic (`@rutgers.edu`, `@scarletmail.rutgers.edu`) even though CAS is no longer the identity protocol.

## Reference Docs

- `backend/README.md`
- `backend/keycloak/README.md`
- `ARCHITECTURE.md`
- `OCI_MIGRATION_PLAN.md`
