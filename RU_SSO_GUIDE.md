# Rutgers SSO Guide (Deprecated)

This document is retained for historical context.

## Status

The previous Rutgers CAS SSO direction is no longer the primary auth plan.

ScarletSpots now standardizes on Logto for identity and token issuance.

## What Changed

Previous approach:

- mobile redirects to Rutgers CAS
- backend validates CAS ticket
- backend issues local JWT

Current approach:

- mobile authenticates against Logto (OIDC)
- backend validates Logto JWT via issuer + JWKS
- backend admin flows (signup/reset) use Logto Management API

## Why Logto

- supports self-hosting and portability
- avoids dependency on managed auth pricing constraints
- provides flexible app/resource/role management
- aligns with fully dockerized deployment and recovery strategy

## Rutgers Email Restriction

Rutgers domain restrictions remain enforced in backend business logic (`@rutgers.edu`, `@scarletmail.rutgers.edu`) even though CAS is no longer the identity protocol.

## Reference Docs

- `backend/README.md`
- `ARCHITECTURE.md`
- `OCI_MIGRATION_PLAN.md`
