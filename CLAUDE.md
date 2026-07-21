# CLAUDE.md — Squirtle (Curate My World)

Operator's manual for coding agents. Global rules in `~/CLAUDE.md` and
`~/Dropbox/AAA Backup/CLAUDE.md` still apply (light mode, doc headers, file:// links,
FAIL-IS-FAIL); this file covers only what is specific to this repo.

## Purpose
Bay Area event-discovery web app ("Squirtle"). A React/Vite frontend shows curated,
categorized events; a Node/Express backend (`curate-events-api/`) aggregates them from
two live sources — the Ticketmaster API and a venue-calendar scraper cache — normalizes
them into ~12 categories, and serves a Postgres-backed precomputed cache so user requests
never hit Ticketmaster live. Deployed on Vercel (frontend) + Railway (backend + Postgres).

## Architecture map (load-bearing files, absolute paths)
Repo root: `/Users/arjundivecha/Dropbox/AAA Backup/A Working/Curate-My-World Squirtle/`
- `curate-events-api/server.js` — Express app entry / bootstrap.
- `curate-events-api/src/routes/events.js` — **main API + all-categories cache orchestration** (897 lines; read first).
- `curate-events-api/src/clients/TicketmasterClient.js` — TM fetch + PT timezone conversion.
- `curate-events-api/src/clients/VenueScraperClient.js` — serves scraped events from cache.
- `curate-events-api/src/utils/categoryMapping.js` — **single source of truth** for category normalization.
- `curate-events-api/src/utils/venueCacheDb.js` — Postgres cache + scrape-run history.
- `curate-events-api/src/utils/venueRefreshScheduler.js` — daily 6 AM PT refresh (setTimeout loop, not cron).
- `curate-events-api/src/utils/timeZoneDate.js` — DST-safe America/Los_Angeles offset math.
- `curate-events-api/src/utils/config.js` — env validation, CORS, rate-limit defaults.
- `curate-events-api/src/routes/preview.js` — hardened preview proxy (host allowlist + SSRF guard).
- `curate-events-api/scripts/scrape-venues.js` — daily venue scrape (DeepSeek V4 Flash → Haiku fallback).
- `src/hooks/useDashboardLogic.ts` — main frontend state machine + auto-fetch.
- `src/components/Dashboard.tsx` — dashboard shell + view switching.
- `data/venue-registry.json` — production venue list; `data/venue-events-cache.json` — scraped-event cache.
- `openwiki/` — generated deep docs (start at `openwiki/quickstart.md`); auto-updated by CI.

## Commands
Run from the paths shown. "verified" = executed during this review; "(unverified)" = script
exists in `package.json` but was not run this session.
- Backend dev: `cd curate-events-api && npm run dev` — node --watch server.js, port 8765 (unverified).
- Frontend dev: `npm run dev` — Vite, port 8766 (unverified).
- Start both: `npm start` (root, `scripts/start-all.sh`) / stop: `npm run stop` (unverified).
- Port status: `node scripts/port-manager.js status` — **verified** (also `npm run port:cleanup`).
- Backend tests: `cd curate-events-api && npm test` — **verified**: prints "No tests found, exiting with code 0". There are currently **zero real tests** (see FABLE.md P0).
- Venue scrape: `cd curate-events-api && npm run scrape:venues` (full) / `npm run scrape:retry` (failed only). Spends Anthropic/OpenRouter + Jina calls — do NOT run casually (unverified).
- Daily update job: `cd curate-events-api && npm run daily:update` — the job the scheduler spawns (unverified).
- Health (needs running server): `curl http://127.0.0.1:8765/api/health` and `/api/health/deep` (unverified).

## Data locations (absolute paths)
- Venue registry: `/Users/arjundivecha/Dropbox/AAA Backup/A Working/Curate-My-World Squirtle/data/venue-registry.json`
- Scraped-event cache: `.../data/venue-events-cache.json` (+ `venue-events-cache.backup-*.json`)
- SVDA candidates: `.../data/venue-candidates/` (managed-agent venue discovery)
- Local env (gitignored, real keys): `.../.env` and `.../curate-events-api/.env`
- Fallback keys read by scraper: `/Users/arjundivecha/Dropbox/AAA Backup/.env.txt`
- Prod cache: Postgres `all_categories_response_cache` table (Railway `DATABASE_URL`)

## Conventions & gotchas (repo-specific; history shows these bite)
- **Category changes go in `categoryMapping.js` only.** `normalizeCategory()` is the single source of truth. `art` has no Ticketmaster mapping (TM "Arts & Theatre" is theatre/comedy, not visual art).
- **Cache-first, never live at request time.** `/all-categories` reads the Postgres cache; the scheduler precomputes it. Do NOT introduce request-time Ticketmaster/scraping calls into API handlers.
- **Timezone:** TM dates are venue-local (Pacific). Always convert via `timeZoneDate.js` / `America/Los_Angeles`, never the server's local TZ — Railway runs UTC and this shifted every event 7–8h in a past bug.
- **No fabricated dates:** events with missing/unparseable start dates are dropped, not stamped "today" (`TicketmasterClient.js`). Preserve this.
- **Route order:** in `events.js`, `GET /categories` must be registered before `GET /:category` or the list route gets shadowed (past bug).
- **Preview proxy is intentionally restricted** (`preview.js`): keep the private-host/SSRF block and the venue-registry+ticketing allowlist.
- **Railway `staging` is the live backend**, not `production`. Frontend `VITE_API_BASE_URL=https://squirtle-api-staging.up.railway.app/api`. Do NOT run "sync/merge production into staging" — it previously proposed deleting staging services.
- **Scraper is fail-loud by design:** a corrupt cache file makes `scrape-venues.js` refuse to run (prevents wiping venue history); a malformed LLM response throws instead of recording "success with 0 events". Don't "fix" these into silent fallbacks.
- **Two backends exist:** `curate-events-api/` is the live one. `backend/` (gitignored) is an abandoned parallel TypeScript implementation — ignore it. Root Python files (`user_input_processor.py`, etc.) are orphaned legacy.

## Current state
- **Active** (141 commits in 2026, latest early July). Production-deployed and in use.
- **Known-broken / gap:** zero automated tests despite a long history of correctness bugs; DB cache write/read failures are logged only, never alerted (`venueCacheDb.js`, `events.js`) — a Postgres outage degrades silently to an empty response.
- **Owner action pending:** API keys (Ticketmaster, Anthropic, OpenRouter) were committed to git history in the past (`.env` added in commit `0d68f6b`) — rotate them. See FABLE.md / ARJUN.md.
- Deep architecture/domain docs live in `openwiki/`; treat as a reference but verify against source before changing behavior.
