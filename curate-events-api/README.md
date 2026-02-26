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

- `ANTHROPIC_API_KEY` (required for venue scraping jobs)
- `DATABASE_URL` (required for DB list storage and DB-backed venue cache)
- `LIST_STORAGE_MODE=db` (recommended in cloud)
- `FRONTEND_URL=https://squirtle-eta.vercel.app` (CORS in production)

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
