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
- Normalizes into 9 categories:
  - Music, Theatre, Comedy, Movies, Art, Food, Tech, Lectures, Kids
- Supports search, category filters, date filters/presets, and multiple viewing modes:
  - Event View
  - Day View (category lanes)
  - Week View (day grid)
- Supports moderation lists:
  - Block event
  - Block site/domain
- Persists data in cloud when DB configured:
  - List storage in Postgres (`LIST_STORAGE_MODE=db`)
  - Venue cache persistence in Postgres when `DATABASE_URL` is set

## Background Refresh Behavior

Venue data is served stale-while-revalidate:
- If cache is stale, API can trigger a background scrape (unless disabled)
- API continues serving last good cache if refresh fails
- Daily scheduled scrape can run (default 6:00 AM Pacific) when enabled/configured
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

---
Last updated: 2026-02-11
