# Rutgers CAS SSO Guide

## Purpose

Document the fallback plan for replacing third-party auth with Rutgers CAS if product or cost constraints make that necessary.

## Current status

- this is not the active auth path today
- keep it as a documented option, not as assumed current architecture

## Target shape

```text
iOS app / website
  -> CAS login redirect
  -> backend validates CAS ticket
  -> backend maps user identity to local profile
  -> backend issues app session / token
```

## Why keep this doc

- auth costs and policy may change
- Rutgers-only identity still fits the product
- backend ownership of the session layer would reduce dependence on an external auth product

## If revived, revisit

- callback URLs
- backend token issuance model
- profile/user-ID mapping strategy
- mobile login UX
- operational secrets and rotation

Last reviewed: 2026-04-26
