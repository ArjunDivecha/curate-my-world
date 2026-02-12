# Environment Variables

Canonical env configuration for this repo.

## Frontend (`.env` at repo root)

Required in cloud:
- `VITE_API_BASE_URL`

Examples:
- Local: `VITE_API_BASE_URL=http://127.0.0.1:8765/api`
- Cloud: `VITE_API_BASE_URL=https://squirtle-api-staging.up.railway.app/api`

Notes:
- Frontend no longer depends on Perplexity/Exa/SerpAPI/Apyflux runtime keys.
- Keep provider/scraper keys in backend env only.

## Backend (`curate-events-api/.env`)

Required:
- `TICKETMASTER_CONSUMER_KEY`

Recommended for production:
- `ANTHROPIC_API_KEY`
- `DATABASE_URL`
- `LIST_STORAGE_MODE=db`
- `FRONTEND_URL=https://squirtle-eta.vercel.app`

Optional server config:
- `NODE_ENV` (default development)
- `PORT` (default 8765)
- `HOST` (default 127.0.0.1)
- `LOG_LEVEL`

Venue cache/refresh controls:
- `VENUE_CACHE_STORAGE_MODE` (`file` or `db`)
- `VENUE_BACKGROUND_REFRESH` (disable to prevent request-triggered refreshes)
- `VENUE_DAILY_REFRESH_ENABLED`
- `VENUE_DAILY_REFRESH_TIMEZONE` (default `America/Los_Angeles`)
- `VENUE_DAILY_REFRESH_HOUR` (default `6`)
- `VENUE_DAILY_REFRESH_MINUTE` (default `0`)

Note: The all-categories response cache (`all_categories_response_cache` Postgres table) is refreshed automatically by a background scheduler daily at 6:00 AM Pacific (`America/Los_Angeles`). Request-time refresh is opt-in (`refresh=true`) to avoid write-on-read behavior. No env var configuration needed — it runs whenever `DATABASE_URL` is set.

## Current Cloud Values (Live)

- Frontend URL: `https://squirtle-eta.vercel.app`
- Backend URL: `https://squirtle-api-staging.up.railway.app`
- Frontend API base: `https://squirtle-api-staging.up.railway.app/api`

## Railway Safety Notes

- Live backend currently runs in Railway `staging` environment.
- Railway `production` environment has previously been empty/misaligned.
- Avoid using "Sync/Merge production into staging" without reviewing full diff.

---
Last updated: 2026-02-11
