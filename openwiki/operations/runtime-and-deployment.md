# Runtime and Deployment

This repository currently runs as a Vercel frontend plus a Railway backend.

## Live shape
From `README.md` and `ENVIRONMENT.md`:

- Frontend URL: `https://squirtle-eta.vercel.app`
- Backend URL: `https://squirtle-api-staging.up.railway.app`
- Backend health endpoint: `https://squirtle-api-staging.up.railway.app/api/health`
- Frontend API base: `https://squirtle-api-staging.up.railway.app/api`

The backend is currently expected to run from the Railway `staging` environment.

## Environment variables
`curate-events-api/src/utils/config.js` is the backend config entrypoint. Notable env vars include:

- `TICKETMASTER_CONSUMER_KEY` — required
- `ANTHROPIC_API_KEY` — recommended for venue scraping
- `DATABASE_URL` — enables Postgres-backed cache/list storage paths
- `FRONTEND_URL` — used for production CORS
- `LIST_STORAGE_MODE` — controls list storage mode
- `VENUE_CACHE_STORAGE_MODE` — file or DB cache mode
- `VENUE_DAILY_REFRESH_ENABLED`
- `VENUE_DAILY_REFRESH_TIMEZONE`
- `VENUE_DAILY_REFRESH_HOUR`
- `VENUE_DAILY_REFRESH_MINUTE`
- `EVENTS_TIME_ZONE`

The backend defaults CORS in production to the known frontend URL instead of `*` when `FRONTEND_URL` is missing.

## Caching and refresh behavior
Two production caches matter most:

- the venue cache in file or Postgres form
- the all-categories response cache in Postgres

`curate-events-api/src/utils/venueRefreshScheduler.js` triggers the daily update job at about 6:00 AM Pacific when enabled. `curate-events-api/src/routes/events.js` also supports explicit refresh behavior for the all-categories cache without turning every user request into a live fetch.

## Health checks
`curate-events-api/src/routes/health.js` returns both a simple and a deep health view.
The deep check includes provider connectivity and list-storage status. If venue cache freshness degrades, the overall status can drop to `degraded` rather than `healthy`.

## Preview proxy safety
`curate-events-api/src/routes/preview.js` used to behave like an open proxy. It is now intentionally restricted:

- private/internal hosts are blocked
- only approved event-domain hosts are previewable
- unknown hosts get a fallback "Open in New Tab" page

That behavior is deliberate and should be preserved.

## Deployment cautions
- Do not blindly sync Railway production and staging.
- Keep the frontend API base pointed at the live backend environment.
- When changing cache or scheduler behavior, check both file-backed and DB-backed modes.
- If you add a new env var, update `ENVIRONMENT.md` and backend config together.
