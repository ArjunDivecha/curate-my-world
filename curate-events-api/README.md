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

## Venue Cache and Refresh

- Storage mode:
  - file: `data/venue-events-cache.json`
  - db: Postgres table via `DATABASE_URL`
- Background refresh:
  - API may trigger stale cache refresh in background
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
- `npm run scrape:venues` - full venue scrape
- `npm run scrape:retry` - retry failed venue scrapes
- `npm run scrape:venues:db` - full scrape with DB write mode
- `npm run scrape:retry:db` - retry failed with DB write mode
- `npm run migrate:lists` - migrate local list data to DB

## Production Deployment

Current live deployment pattern:
- Railway service: `squirtle-api`
- Railway environment carrying live traffic: `staging`
- Connected repo: `ArjunDivecha/curate-my-world`
- Branch: `main`

---
Last updated: 2026-02-11
