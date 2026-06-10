# Squirtle Event Finder (Curate My World)

Production event discovery app for Bay Area events, backed by:
- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express (`curate-events-api`)
- Deploy: Vercel (frontend) + Railway (backend + Postgres)

## Current System (Source of Truth)

- Frontend repo: `ArjunDivecha/curate-my-world`
- Frontend URL: `https://squirtle-eta.vercel.app`
- Backend URL: `https://squirtle-api-staging.up.railway.app`
- Backend health: `https://squirtle-api-staging.up.railway.app/api/health`
- Frontend API base env: `VITE_API_BASE_URL=https://squirtle-api-staging.up.railway.app/api`

Important: Railway `staging` is currently the live backend environment. Railway `production` has been empty/misaligned in prior incidents.

## What The App Does

- Aggregates events from:
  - Ticketmaster API (structured, high-volume)
  - Venue scraper cache (Jina Reader + Claude Haiku extraction)
- Normalizes into 10 categories:
  - Music, Theatre, Comedy, Movies, Art, Food, Tech, Lectures, Kids, Desi
- Supports search, category filters, date filters/presets, and two primary viewing modes:
  - Event View
  - Date View (adapts by preset: Today, Next 7 Days, This Weekend, Next 30 Days)
- UI behavior notes:
  - Events auto-load on page startup
  - Events auto-refresh as filter context changes (search/date/category/preset/view)
  - `Reset Filters` clears active filters without wiping loaded data
- Supports moderation lists:
  - Block event
  - Block site/domain
- Persists data in cloud when DB configured:
  - All-categories response cache in Postgres (auto-refreshed daily at 6:00 AM PT)
  - List storage in Postgres (`LIST_STORAGE_MODE=db`)
  - Venue cache persistence in Postgres when `DATABASE_URL` is set

## Background Refresh & Caching

### All-Categories Response Cache (Postgres-backed)
The `/all-categories` endpoint **never** makes live Ticketmaster API calls during a user request. Instead:
- A background scheduler pre-computes the full all-categories response and writes it to Postgres (`all_categories_response_cache` table)
- **Daily at 6:00 AM Pacific (`America/Los_Angeles`)**: scheduler refreshes the cache
- Frontend auto-fetch flow reads from Postgres cache (instant, single DB read)
- If cache is >24h old, it still serves stale cached data by default (no write-on-read)
- Request-time refresh is opt-in via `refresh=true` on `/api/events/all-categories`
- If no cache exists yet, returns empty response; daily scheduler (or explicit `refresh=true`) builds it

### Venue Scraper Cache
- Daily scheduled scrape at 6:00 AM Pacific writes venue data to Postgres
- Stale-while-revalidate: API serves last good cache if refresh fails
- Inspect status at: `GET /api/events/refresh-status`

## Providers: Active vs Removed

Active providers:
- Ticketmaster
- Venue scraper

Removed from live pipeline (historical only):
- Perplexity, Exa, Serper/SerpAPI, Apyflux

Some legacy scripts still exist in `scripts/` for experiments/benchmarks; they are not part of production runtime.

## Repository Structure

```text
curate-my-world/
├── src/                         # Frontend app
│   ├── components/
│   │   ├── Dashboard.tsx
│   │   ├── EventCard.tsx
│   │   ├── DayTimetable.tsx
│   │   ├── WeekDayGrid.tsx
│   │   └── WeeklyCalendar.tsx   # Legacy/alternate calendar component
│   └── utils/apiConfig.ts
├── curate-events-api/           # Backend API
│   ├── src/clients/
│   │   ├── TicketmasterClient.js
│   │   └── VenueScraperClient.js
│   ├── src/routes/
│   │   ├── events.js
│   │   ├── lists.js
│   │   └── health.js
│   ├── src/utils/
│   │   ├── categoryMapping.js
│   │   ├── eventValidator.js
│   │   ├── listManager.js
│   │   ├── venueCacheDb.js
│   │   └── venueRefreshScheduler.js
│   └── scripts/scrape-venues.js
├── data/
│   ├── venue-registry.json
│   └── venue-events-cache.json
└── docs/
```

## Local Development

Prereqs:
- Node 18+
- Ticketmaster API key
- Anthropic API key (required for venue scraping jobs)

Setup:

```bash
# repo root
npm install

# backend
cd curate-events-api
npm install
cp .env.example .env
# add keys in curate-events-api/.env
```

Run:

```bash
# backend (port 8765)
cd curate-events-api
npm run dev

# frontend (port 8766)
cd ..
npm run dev
```

Or use root scripts:

```bash
npm start
npm run stop
npm run port:status
```

## Cloud Deployment Notes

### Vercel
- Should be connected to this repo so pushes to `main` update frontend.
- Critical env:
  - `VITE_API_BASE_URL=https://squirtle-api-staging.up.railway.app/api`

### Railway
- Service: `squirtle-api`
- Environment currently used in production traffic: `staging`
- Branch target should be `main`
- Do not run “Sync/Merge production into staging” blindly; this previously proposed deleting staging services.

## API Endpoints

Core:
- `GET /api/events/all-categories`
- `GET /api/events/:category`
- `GET /api/events/categories`
- `GET /api/events/refresh-status`
- `POST /api/events/refresh` (manual trigger path if enabled)

Lists:
- `GET /api/lists/`
- `POST /api/lists/blacklist-event`
- `DELETE /api/lists/blacklist-event`
- `POST /api/lists/blacklist-site`
- `DELETE /api/lists/blacklist-site`

Health:
- `GET /api/health`
- `GET /api/health/deep`

## Notes on Older Documents

`IMPLEMENTATION_PLAN.md` and `REDESIGN_REPORT.md` are historical planning/analysis artifacts, not live runbooks.

## June 2026 Correctness & Safety Fixes

The following fixes were applied after a full code review (all verified end-to-end locally):

### Data integrity
- **Cache schema repaired**: 11 venue entries that had been written to the root of `data/venue-events-cache.json` (instead of under `venues`) were moved/merged into `venues`. A timestamped backup was saved as `data/venue-events-cache.backup-*.json` before the repair.
- **Fail-loud cache loader** (`scrape-venues.js`): if the cache file exists but is corrupt or malformed, the scraper now refuses to run instead of silently starting with an empty cache (which would have wiped all venue history on its next save).
- **Fail-loud LLM parsing** (`scrape-venues.js`): a malformed model response now throws (preserving the venue's previous events, status `error`) instead of being recorded as "success with 0 events".
- **Truncation detection**: model responses cut off at `max_tokens` are treated as errors; token budgets raised 4096 → 16000 for both extractors.
- **Degraded-run detection**: a scrape where >50% of attempted venues fail is recorded as `partial_failure` instead of `success`.

### Correctness
- **Ticketmaster timezone fix** (`TicketmasterClient.js`): event dates/times from TM are venue-local (Pacific). They are now converted explicitly via `America/Los_Angeles` instead of the server's local timezone — on a UTC server (Railway) every event time was previously shifted by 7-8 hours.
- **No fabricated dates**: TM events with no/unparseable start date are now dropped instead of being assigned "today".
- **Route shadowing fixed** (`events.js`): `GET /api/events/categories` is now registered before `GET /api/events/:category`, so it returns the category list instead of a 400. The `GET /` handler also now uses the canonical `SUPPORTED_CATEGORIES` list.
- **Category duplication guard** (`events.js`): events with an empty category are stamped with the category they were fetched for, preventing one event from appearing in all 12 buckets.
- **Cache write failures surface** (`events.js`): if the background all-categories refresh computes events but cannot write them to Postgres (e.g. missing `DATABASE_URL`), it now logs an explicit error instead of "refresh complete".

### Security
- **Preview proxy locked down** (`preview.js`): `GET /api/preview?url=` was an open proxy. It now (1) blocks private/internal hosts (SSRF), and (2) only proxies domains in the venue registry plus known ticketing platforms; everything else gets the "Open in New Tab" fallback page.
- **Production CORS default**: missing `FRONTEND_URL` now falls back to `https://squirtle-eta.vercel.app` instead of `*`.
- **Jina Reader hardening** (`scrape-venues.js`): retries with backoff on 429/5xx/network errors; optional `JINA_API_KEY` env var is used when present for higher rate limits.
- **Prompt-injection hardening**: scraped calendar content is delimited and explicitly marked as untrusted data in the extraction prompt.

### Still pending (requires owner action)
- **Rotate API keys**: keys were present in git history (`.env` was committed in the past). Rotate the Ticketmaster, Anthropic, and OpenRouter keys, then update Railway/local `.env`.
- The scraper still reads fallback keys from `/Users/arjundivecha/Dropbox/AAA Backup/.env.txt` (kept by design for local runs).

---
Last updated: 2026-06-09
