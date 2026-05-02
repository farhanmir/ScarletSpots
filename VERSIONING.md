# ScarletSpots — Versioning Guide

> **Read this first if you're an LLM or developer about to change version numbers.**

---

## Architecture: Three independent versions

ScarletSpots has three independently versioned components. They do **not** share a version number — a backend API update doesn't mean the iOS app changes, and vice versa.

| Component | VERSION file | Format | Starting version |
|-----------|-------------|--------|-----------------|
| Backend (FastAPI) | `backend/VERSION` | SemVer `X.Y.Z` | `0.1.0` (pre-launch) |
| iOS App | `ios/ScarletSpots/VERSION` | SemVer `X.Y.Z` | `1.0.0` (first App Store release) |
| Website | `website/VERSION` | SemVer `X.Y.Z` | `1.0.0` (first public deploy) |

> **Why does backend start at `0.1.0`?** The API is not yet publicly launched and may have breaking changes. It becomes `1.0.0` on launch day. iOS starts at `1.0.0` because that's the App Store convention for a first release.

---

## Git SHA — the precision layer

Every deployed artifact also embeds the exact git commit SHA. This is what you use to say "that user is on commit `6d9aac08`" and pinpoint the exact code running.

| Where | How it's injected | How to read it |
|-------|------------------|----------------|
| Backend | Docker `--build-arg GIT_SHA=$(git rev-parse --short HEAD)` | `GET /health` → `git_sha` or `GET /api/v1/system/version` |
| iOS App | XcodeGen pre-build script writes to xcconfig → Info.plist | `Env.gitSHA`, displayed in Settings → Diagnostics |
| Website | Vite `define` at build time → `__GIT_SHA__` global | Visit `?debug` URL param to see in bottom-right badge |

---

## SemVer rules — when to bump what

Use standard SemVer. In short:

### Backend (`backend/VERSION`)
| Bump | When |
|------|------|
| **patch** `0.1.0 → 0.1.1` | Bug fix, performance tweak, no schema change |
| **minor** `0.1.0 → 0.2.0` | New endpoint or field added (backwards-compatible) |
| **major** `0.1.0 → 1.0.0` | Breaking API change — existing iOS clients would break |

> ⚠️ **Coordinate with iOS before major backend bumps.** The iOS app pings `GET /api/v1/system/version` and can check the version on startup.

### iOS App (`ios/ScarletSpots/VERSION`)
| Bump | When |
|------|------|
| **patch** `1.0.0 → 1.0.1` | Crash fix, minor UI polish, no new features |
| **minor** `1.0.0 → 1.1.0` | New feature, significant UI change |
| **major** `1.0.0 → 2.0.0` | Major redesign, iOS minimum version bump |

> The iOS **build number** (`CFBundleVersion`) is auto-incremented by CI (= GitHub Actions run number). You never touch it manually.

### Website (`website/VERSION`)
| Bump | When |
|------|------|
| **patch** `1.0.0 → 1.0.1` | Copy fix, bug fix |
| **minor** `1.0.0 → 1.1.0` | New section, significant visual change |
| **major** `1.0.0 → 2.0.0` | Full redesign |

---

## How to bump a version

### Option A — Script (recommended)
```bash
# Run from the repo root
bash scripts/bump_version.sh <backend|ios|website> <major|minor|patch>

# Examples:
bash scripts/bump_version.sh backend minor    # 0.1.0 → 0.2.0
bash scripts/bump_version.sh ios patch        # 1.0.0 → 1.0.1
bash scripts/bump_version.sh website patch    # 1.0.0 → 1.0.1
```

### Option B — Manual
Edit the one-line `VERSION` file for the component:
```
# backend/VERSION
0.2.0
```

Then for iOS specifically, also update `MARKETING_VERSION` in `ios/ScarletSpots/project.yml`:
```yaml
settings:
  base:
    MARKETING_VERSION: "1.1.0"   # keep in sync with ios/ScarletSpots/VERSION
```

Then commit:
```bash
git add backend/VERSION  # or ios/... or website/...
git commit -m "chore(backend): bump version to 0.2.0"
```

---

## How versions surface to you

### Backend
```bash
curl https://your-api.com/health
# → { "version": "0.1.0", "git_sha": "6d9aac08", ... }

curl https://your-api.com/api/v1/system/version
# → { "component": "backend", "version": "0.1.0", "git_sha": "6d9aac08", "build_timestamp": "..." }
```

The server must be rebuilt with `GIT_SHA` passed:
```bash
# On the production server after git pull:
GIT_SHA=$(git rev-parse --short HEAD) docker compose up --build -d backend
```

### iOS App (your device / TestFlight)
Profile tab → Diagnostics section (only visible for `canAccessDiagnostics` users — your team):
```
APP VERSION   1.0.0 (42) · 6d9aac08
API HOST      api.scarletspots.com
```
Format: `<marketing version> (<CI run number>) · <git SHA>`

### Website
Visit `https://scarletspots.com?debug` — a badge appears bottom-right:
```
⚙ Debug Info
website  1.0.0
sha      6d9aac08
built    5/2/2026, 7:00:00 PM
```

---

## Launch day checklist

- [ ] Bump `backend/VERSION` from `0.1.0` → `1.0.0`
- [ ] Verify iOS `ios/ScarletSpots/VERSION` is `1.0.0` and `project.yml` `MARKETING_VERSION` matches
- [ ] Verify `website/VERSION` is `1.0.0`
- [ ] Rebuild the backend Docker container with `GIT_SHA` set
- [ ] Run the iOS archive CI workflow to produce the signed App Store IPA
- [ ] Deploy website with `GIT_SHA=$(git rev-parse --short HEAD) npm run build`
- [ ] Confirm `GET /health` returns the new version before App Store submission

---

## Notes for LLMs

- **Never hardcode version strings** in source code. Always read from the `VERSION` file or the build system (Info.plist, `__APP_VERSION__`).
- **The git SHA is not a version bump** — it changes automatically with every commit. Never manually edit a SHA.
- **Backend CI note**: The backend does not run CI — it's deployed via Docker on a VPS. The developer `git pull`s on the server and runs `docker compose up --build`. The `GIT_SHA` build arg must be passed manually in that command.
- **iOS build number vs. version**: The build number (integer, CFBundleVersion) is the CI run number — it only appears in Xcode / TestFlight / the diagnostics panel. The version string (X.Y.Z, CFBundleShortVersionString) is what users see on the App Store.
