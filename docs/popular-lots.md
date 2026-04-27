# Popular Lots

## Current behavior

The Swift native app still relies on a placeholder popular-lots path sourced locally from bundled lot data.

## Desired behavior

Show lots a user actually parks in most often, with campus-aware global popularity as fallback when personal history is sparse.

## Recommended backend shape

`GET /lots/popular?limit=6`

The response should return ordered lot IDs, not full lot payloads, so clients can resolve them locally from bundled data.

## Native client plan

- request ranked lot IDs
- map them through `LotRepository`
- cache the result
- fall back to the local placeholder when offline or empty

## Scope note

This is a good product-quality improvement, but it should not block launch hardening.

Last reviewed: 2026-04-26
