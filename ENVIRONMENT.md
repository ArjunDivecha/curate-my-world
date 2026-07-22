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
- `OPENROUTER_API_KEY` — primary venue extractor (DeepSeek V4 Flash). Without it
  the scraper falls back to Claude Haiku (needs `ANTHROPIC_API_KEY`), which is
  ~14x more expensive per scrape.
- `ANTHROPIC_API_KEY` — Claude Haiku, the extractor error-fallback.
- `JINA_API_KEY` — Jina Reader (page fetch). **Strongly recommended:** without
  it the scraper runs anonymously against a low rate limit, so it must throttle
  concurrency to 3 and still risks 429 storms. With a key, concurrency defaults
  to 8 and a full scrape runs in ~45 min instead of 4-6 h.
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

Venue scraper performance (`scrape-venues.js`):
- `SCRAPE_CONCURRENCY` — venues fetched in parallel. Default `8` when
  `JINA_API_KEY` is set, else `3`. Per-venue cost is dominated by LLM
  extraction on large calendars, not fetch, so raising this past ~8 has
  diminishing returns.
- `SCRAPE_PERSIST_EVERY` — cache is persisted (disk + Postgres) every N venues
  instead of after each one. Default `25`. A crash loses at most this many
  venues' results.
- Registry venues with `"enabled": false` in `data/venue-registry.json` are
  skipped without being deleted (used to quarantine chronically-unfetchable
  sites); the record keeps `disabled_reason` / `disabled_at`.

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
Last updated: 2026-07-21
