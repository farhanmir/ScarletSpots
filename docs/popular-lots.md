# Popular Lots

## Current behavior

The Swift native app still uses a placeholder popular-lots list sourced locally from bundled lot data. The old React Native app has its own placeholder path and is left untouched for reference.

## Desired behavior

Show the lots a user actually parks in most often, topped up by campus-aware global popularity when personal history is sparse.

## Recommended backend shape

`GET /lots/popular?limit=6`

Response should provide ordered lot IDs, not full lot payloads, so clients can resolve them locally from bundled data.

## Native client plan

In the Swift app:
- request ranked lot IDs
- map them through `LotRepository`
- cache the result
- fall back to the current local placeholder when offline or empty

## Why this is separate

This should not block launch polish, but it is one of the cleanest product wins left for Search.

Last reviewed: 2026-04-26
