# Rutgers SSO (CAS) Integration Guide

This guide details how to replace Supabase Auth with Rutgers Central Authentication Service (CAS) for free SSO.

## Overview
To avoid Supabase's paid Enterprise SSO tier, we implement the CAS protocol directly in our FastAPI backend and issue our own JWTs for session management.

## Technical Architecture
1. **Frontend (Expo)**: Uses `expo-auth-session` to open the Rutgers CAS login page.
2. **Backend (FastAPI)**: 
   - Receives a `ticket` from the CAS callback.
   - Validates the ticket with `https://cas.rutgers.edu/serviceValidate`.
   - Extracts the NetID and user attributes.
   - Issues a local JWT (signed with a private secret).
3. **Database (Supabase)**: We continue using the `profiles` table, but we bypass Supabase's internal `auth.users` for new sign-ups, using deterministic UUIDs (via NetID) or mapping emails.

## CAS Registration Details
To use this in production, you must submit an **Enterprise CAS request** to Rutgers IT.

| Field | Recommended Value |
|-------|-------------------|
| **Request Type** | New Integration (Production & Test) |
| **Service Name** | ScarletSpots |
| **Production URL** | `https://api.scarletspots.app/api/v1/auth/cas/callback` |
| **Test URL** | `https://dev-api.scarletspots.app/api/v1/auth/cas/callback` |
| **CAS Version** | CAS 6.5 |
| **Protocol** | CAS 2.0 or 3.0 |
| **Attributes** | `uid` (NetID), `email`, `givenName`, `sn` |

## Resources
- [Rutgers CAS Documentation](https://it.rutgers.edu/knowledgebase/requesting-a-cas-service/)
- [Roadmap Context](ROADMAP.md)
