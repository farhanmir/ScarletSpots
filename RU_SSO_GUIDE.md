# Rutgers CAS SSO Guide

## Purpose

Document the fallback path for replacing Supabase-backed auth with Rutgers CAS if cost, policy, or product constraints ever require it.

## Current status

- not active today
- current production direction remains Supabase-backed auth with Rutgers email-domain enforcement in the native client

## Target shape

```text
iOS app / website
  -> CAS login redirect
  -> backend validates CAS ticket
  -> backend maps identity to local profile
  -> backend issues app session/token
```

## Why keep this around

- auth costs can change
- Rutgers-only identity still fits the product cleanly
- owning the session layer would reduce third-party coupling

## If revived, re-check

- callback URLs
- token issuance and refresh model
- account linking and profile migration
- mobile login UX
- secret storage and rotation

Last reviewed: 2026-04-26
