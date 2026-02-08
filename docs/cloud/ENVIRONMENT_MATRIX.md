# Environment Matrix (Local, Staging, Production)

This matrix is the Phase 0 baseline for cloud deployment and iOS integration.

## Environments

- `local`: developer machine
- `staging`: pre-production deployment for validation
- `production`: public deployment for end users

Current operational state (Feb 2026):
- Frontend is deployed on Vercel production.
- Backend is deployed on Railway `staging` and is acting as the effective production backend URL.
- Railway `production` environment currently has no services for this project.

## Frontend (Vercel / local Vite)

| Variable | local | staging | production | Owner |
| --- | --- | --- | --- | --- |
| `VITE_API_BASE_URL` | `http://127.0.0.1:8765/api` | `https://squirtle-api-staging.up.railway.app/api` | `https://squirtle-api-staging.up.railway.app/api` | frontend |
| `NODE_ENV` | `development` | `production` | `production` | platform |

Notes:
- Current frontend has local fallback logic in `src/utils/apiConfig.ts`. Keep this variable as the source of truth during cloud migration.

## Backend (Railway / local)

| Variable | local | staging | production | Required |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | `development` | `production` | `production` | yes |
| `PORT` | `8765` | Railway assigned | Railway assigned | yes |
| `HOST` | `127.0.0.1` | `0.0.0.0` | `0.0.0.0` | yes |
| `FRONTEND_URL` | `http://127.0.0.1:8766` | `https://squirtle-eta.vercel.app` | `https://squirtle-eta.vercel.app` | yes |
| `LIST_STORAGE_MODE` | `file` | `db` (after migration) | `db` | yes |
| `DATABASE_URL` | optional | Railway Postgres URL | Railway Postgres URL | required for `db` mode |
| `VENUE_CACHE_STORAGE_MODE` | `file` | `db` | `db` | recommended |
| `VENUE_BACKGROUND_REFRESH` | enabled | enabled | enabled | optional |
| `VENUE_DAILY_REFRESH_ENABLED` | unset | auto (enabled in `production` when `DATABASE_URL` + `ANTHROPIC_API_KEY` are set) | auto (enabled in `production` when `DATABASE_URL` + `ANTHROPIC_API_KEY` are set) | optional |
| `VENUE_DAILY_REFRESH_TIMEZONE` | `America/Los_Angeles` | `America/Los_Angeles` | `America/Los_Angeles` | optional |
| `VENUE_DAILY_REFRESH_HOUR` | `6` | `6` | `6` | optional |
| `VENUE_DAILY_REFRESH_MINUTE` | `0` | `0` | `0` | optional |
| `LIST_DB_SYNC_INTERVAL_MS` | `30000` | `30000` | `30000` | optional |
| `TICKETMASTER_CONSUMER_KEY` | local secret | staging secret | prod secret | yes |
| `ANTHROPIC_API_KEY` | local secret | staging secret | prod secret | recommended |
| `LOG_LEVEL` | `debug` | `info` | `info` | recommended |
| `JINA_READER_URL` | default | default | default | optional |
| `GOOGLE_MAPS_PLATFORM_API_KEY` | optional | optional | optional | optional |
| `RAILWAY_ENVIRONMENT` | unset | set by Railway | set by Railway | platform |

Legacy optional keys still present in config:
- `PERPLEXITY_API_KEY`, `PPLX_API_KEY`
- `APYFLUX_API_KEY`, `APYFLUX_APP_ID`, `APYFLUX_CLIENT_ID`
- `EXA_API_KEY`, `SERPER_API_KEY`
- `SUPER_HYBRID_URL`, `SUPER_HYBRID_DEFAULT`

## iOS App (Xcode)

Use `.xcconfig` files per build config:
- `Config/Debug.xcconfig`
- `Config/Staging.xcconfig`
- `Config/Release.xcconfig`

Required app-side values:

| Key | Debug | Staging | Release |
| --- | --- | --- | --- |
| `API_BASE_URL` | `http://127.0.0.1:8765/api` (simulator-only) | `https://<railway-staging>/api` | `https://<railway-prod>/api` |
| `WEB_BASE_URL` | `http://127.0.0.1:8766` | `https://<vercel-staging>` | `https://<vercel-prod>` |

Rules:
- No provider API secrets in iOS app binary.
- iOS app only calls backend API URLs.

## Promotion Rules

Before promoting staging -> production:
- Backend health check passes: `/api/health` and `/api/health/deep`.
- Frontend can fetch `/api/events` and `/api/events/all-categories`.
- iOS staging build can reach staging backend on non-local network.
