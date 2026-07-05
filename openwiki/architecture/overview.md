# Architecture Overview

Squirtle has a two-app shape with a shared data layer:

- a React/Vite frontend in `src/`
- a Node/Express backend in `curate-events-api/`
- shared JSON and report artifacts in `data/`
- optional Postgres persistence for caches and list storage

## High-level data flow
1. The frontend loads the dashboard and auto-fetches events.
2. The backend assembles events from Ticketmaster and the venue scraper cache.
3. The backend deduplicates, validates, filters, and categories events before returning them.
4. A background process refreshes the venue cache and the all-categories response cache.
5. The frontend reads cached event data and re-fetches when filters change.

## Frontend
The frontend lives in `src/` and is centered on the dashboard flow:

- `src/App.tsx` defines routes for `/`, `/api-tester`, and the catch-all not found page.
- `src/hooks/useDashboardLogic.ts` owns the main state machine: selected categories, providers, date preset, search query, cached local state, refresh polling, and auto-fetch triggers.
- `src/components/Dashboard.tsx` renders the product UI and view switching.
- `src/components/EventCard.tsx` handles event actions like preview, open, and list management.

The frontend cache key and auto-fetch behavior are important to preserve when changing the event model. `useDashboardLogic.ts` restores a local cache snapshot, polls refresh status, and refreshes automatically when search/date/provider context changes.

## Backend
The backend code is concentrated in `curate-events-api/src/`.

### Event route
`curate-events-api/src/routes/events.js` is the main API surface. It wires together:

- `TicketmasterClient`
- `VenueScraperClient`
- legacy `WhitelistClient`
- `EventDeduplicator`
- `LocationFilter`
- `DateFilter`
- `filterValidEvents`
- rules and blacklist filters
- Postgres-backed all-categories cache helpers

This route also owns the background refresh orchestration for the all-categories cache. The cache is not supposed to hit Ticketmaster live on every request.

### Supporting routes
- `curate-events-api/src/routes/health.js` exposes health and deep-health checks.
- `curate-events-api/src/routes/lists.js` manages whitelist and blacklist writes with production safeguards.
- `curate-events-api/src/routes/preview.js` provides the preview proxy and event-data preview page.
- `curate-events-api/src/routes/rules.js` and related filters apply shared path/category rules.

### Runtime utilities
- `curate-events-api/src/utils/config.js` reads env vars, validates critical config, and sets CORS/rate-limiting defaults.
- `curate-events-api/src/utils/categoryMapping.js` is the category source of truth.
- `curate-events-api/src/utils/venueCacheDb.js` persists venue cache state, scrape run history, and all-categories response cache rows.
- `curate-events-api/src/utils/venueRefreshScheduler.js` schedules the daily update job around 6:00 AM Pacific.

## Caching and persistence
There are two important caches:

- `data/venue-events-cache.json` for venue-scraped events
- the `all_categories_response_cache` table in Postgres for the precomputed all-categories API response

The venue cache has both file and DB modes. In DB mode, the backend prefers the freshest known cache and can repair the DB from file when needed. The all-categories cache is precomputed and refreshed by the scheduler so user requests stay fast.

## Why this shape exists
The repository evolved toward a cache-first architecture because live scraping and live API fanout were too slow and brittle for request-time use. Recent changes focused on:

- preventing request-time Ticketmaster calls from becoming the default path for all-categories reads
- making venue scraping fail loudly on corrupt cache state
- adding timezone-safe date handling so events do not shift across days on UTC hosts
- tightening the preview proxy against open-proxy and SSRF behavior

## When changing architecture
- Read `curate-events-api/src/routes/events.js` first.
- Check `curate-events-api/src/utils/venueCacheDb.js` before altering cache shape or persistence.
- Check `curate-events-api/src/utils/venueRefreshScheduler.js` before changing refresh timing.
- Check `curate-events-api/src/utils/config.js` before adding new env vars or production defaults.
