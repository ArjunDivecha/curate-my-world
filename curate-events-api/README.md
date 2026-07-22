# Curate Events API

Backend for Squirtle Event Finder.

## Runtime Role

Serves Bay Area events by combining:
- Ticketmaster API results
- Venue scraper cache (file or Postgres-backed)

Then applies:
- deduplication
- category normalization
- quality validation
- location/date/category filters
- list moderation filters (blocked events/sites)

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

Default local URL: `http://127.0.0.1:8765`

## Required Environment Variables

- `TICKETMASTER_CONSUMER_KEY` (required for server startup)

## Recommended Environment Variables

- `OPENROUTER_API_KEY` (primary venue extractor: DeepSeek V4 Flash)
- `ANTHROPIC_API_KEY` (Claude Haiku — extractor error-fallback)
- `JINA_API_KEY` (Jina Reader page fetch; enables concurrency 8 vs 3 anonymous)
- `DATABASE_URL` (required for DB list storage and DB-backed venue cache)
- `LIST_STORAGE_MODE=db` (recommended in cloud)
- `FRONTEND_URL=https://squirtle-eta.vercel.app` (CORS in production)

Scraper performance tuning (optional):
- `SCRAPE_CONCURRENCY` — parallel venues (default 8 with `JINA_API_KEY`, else 3)
- `SCRAPE_PERSIST_EVERY` — persist cache every N venues (default 25)

## Caching & Background Refresh

### All-Categories Response Cache
- The `/all-categories` endpoint **never** makes live TM API calls
- A background scheduler pre-computes the full response and writes to Postgres (`all_categories_response_cache` table)
- Schedule: daily at 6:00 AM Pacific (`America/Los_Angeles`)
- If stale (>24h), serves cached data without mutating cache on read
- Request-time refresh is opt-in via `refresh=true`
- If no cache exists yet, returns empty response; cache can be built by daily scheduler or explicit `refresh=true`
- Postgres table managed by `venueCacheDb.js`

### Venue Scraper Cache
- Storage mode:
  - file: `data/venue-events-cache.json`
  - db: Postgres table via `DATABASE_URL`
- Daily scheduler:
  - Configured by `VENUE_DAILY_REFRESH_*`
  - Typical production setting: 6:00 AM PT
- Status endpoint:
  - `GET /api/events/refresh-status`

### Venue Scrape Execution Model (`scrape-venues.js`)
- Venues are fetched **concurrently** via a bounded worker pool
  (`runWithConcurrency`), not one at a time. Workers pull from a shared cursor,
  so one slow venue never blocks the rest. Concurrency = `SCRAPE_CONCURRENCY`
  (default 8 with `JINA_API_KEY`, 3 anonymous). Full ~436-venue run ≈ 45 min.
- Extractor: DeepSeek V4 Flash (via OpenRouter) primary, Claude Haiku fallback.
  Large calendars can exceed the model token budget and fall back to Haiku.
- Cache is persisted every `SCRAPE_PERSIST_EVERY` venues (default 25), serialized
  so concurrent workers never overlap a write, with a forced final flush.
- `"enabled": false` in `venue-registry.json` quarantines a venue (skipped, not
  deleted). Used for chronically-unfetchable sites so they stop failing every
  run and no longer force `latestRunStatus` to `error`.

## API Endpoints

Events:
- `GET /api/events/all-categories`
- `GET /api/events/:category`
- `GET /api/events/categories`
- `GET /api/events/refresh-status`

Lists:
- `GET /api/lists/`
- `POST /api/lists/blacklist-event`
- `DELETE /api/lists/blacklist-event`
- `POST /api/lists/blacklist-site`
- `DELETE /api/lists/blacklist-site`

Health:
- `GET /api/health`
- `GET /api/health/deep`

## Scripts

- `npm start` - production start
- `npm run dev` - watch mode
- `npm run lint` - lint backend source
- `npm run lint:fix` - lint + auto-fix backend source
- `npm run scrape:venues` - full venue scrape
- `npm run scrape:retry` - retry failed venue scrapes
- `npm run scrape:venues:db` - full scrape with DB write mode
- `npm run scrape:retry:db` - retry failed with DB write mode
- `npm run migrate:lists` - migrate local list data to DB
- `npm run smoke:api` - lightweight API checks against `BASE_URL` (or local default)
- `npm run load:test` - baseline API load test (autocannon-backed)
- `npm run load:test:stress` - higher-intensity load profile

## Production Deployment

Current live deployment pattern:
- Railway service: `squirtle-api`
- Railway environment carrying live traffic: `staging`
- Connected repo: `ArjunDivecha/curate-my-world`
- Branch: `main`

---
Last updated: 2026-02-11
