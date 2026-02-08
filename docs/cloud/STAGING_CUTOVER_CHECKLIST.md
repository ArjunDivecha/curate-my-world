# Staging Cutover Checklist (Railway + Vercel)

Use this checklist to move from local file-backed lists to cloud DB-backed lists in staging.

> Status (Feb 2026): cutover completed and live site is using Railway `staging` as its effective production backend.

## 1) Configure Staging Services

### Railway (backend)
- Deploy backend service using current `railway.json`.
- Set env vars:
  - `NODE_ENV=production`
  - `FRONTEND_URL=https://squirtle-eta.vercel.app`
  - `TICKETMASTER_CONSUMER_KEY=...`
  - `ANTHROPIC_API_KEY=...` (recommended)
  - `LIST_STORAGE_MODE=db`
  - `DATABASE_URL=<railway-postgres-url>`
  - `VENUE_CACHE_STORAGE_MODE=db` (recommended for cloud durability)
  - Optional daily refresh (6:00am Pacific by default):
    - `VENUE_DAILY_REFRESH_ENABLED=true` (or leave unset to auto-enable when `DATABASE_URL` + `ANTHROPIC_API_KEY` exist)

### Vercel (frontend)
- Set env var:
  - `VITE_API_BASE_URL=https://squirtle-api-staging.up.railway.app/api`
- Deploy and confirm frontend loads.

## 2) Baseline Smoke Checks (Before DB Mode)

- Backend:
  - `BASE_URL=https://squirtle-api-staging.up.railway.app npm run -s smoke:api` (from `curate-events-api/`)
  - `BASE_URL=https://squirtle-api-staging.up.railway.app FULL_CHECK=true npm run -s smoke:api`
- Frontend:
  - Verify category load, event fetch, and list endpoints through UI.

## 3) Migrate List Data to DB

Run once with staging `DATABASE_URL`:

```bash
cd curate-events-api
DATABASE_URL=<railway-postgres-url> REPLACE=true npm run migrate:lists
```

Expected: inserted counts for whitelist/blacklist tables.

## 4) Enable DB Mode in Staging

If not already enabled:
- Set `LIST_STORAGE_MODE=db`
- Optional: `LIST_DB_SYNC_INTERVAL_MS=30000`
- Redeploy/restart backend service.

## 5) Verify DB-Backed Behavior

- `GET /api/lists` should return `stats` including:
  - `storageMode: "db"`
  - `dbActive: true`
- Through UI or API:
  - Add a blacklist site/event.
  - Refresh and confirm it persists.
  - Restart backend and confirm persistence remains.

## 6) Rollback (If Needed)

- Set `LIST_STORAGE_MODE=file`
- Redeploy backend.
- Re-run smoke checks.

## 7) Promotion Gate to Production

Only promote if all are true:
- Staging smoke checks pass in full mode.
- List writes persist across backend restart.
- Web UI works on desktop + iPhone browser widths.
- No unexpected 5xx spikes in backend logs.
