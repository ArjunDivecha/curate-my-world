# Persistence Migration Plan (Phase 0)

Goal: remove runtime dependence on local filesystem so Railway/Vercel/iOS work reliably anywhere.

## Current Runtime Persistence

### Mutable runtime files (must migrate off disk)

| Current file | Current use | Read/Write | Migration target |
| --- | --- | --- | --- |
| `data/whitelist.xlsx` | whitelist domains | read + write | `list_entries` table |
| `data/blacklist-sites.xlsx` | blocked domains | read + write | `list_entries` table |
| `data/blacklist-events.xlsx` | blocked event title/url | read + write | `list_entries` table |
| `data/venue-events-cache.json` | cached venue scraper events | read + write | `venue_event_cache` table (or object store + metadata table) |

### Versioned/static files (can stay in git)

| File | Use | Keep in repo |
| --- | --- | --- |
| `data/venue-registry.json` | venue source definitions | yes (until admin UI exists) |

## Proposed Target Model (Railway Postgres)

### Table: `list_entries`

Columns:
- `id` BIGSERIAL PK
- `list_type` enum (`whitelist`, `blacklist_site`, `blacklist_event`)
- `domain` text nullable
- `title` text nullable
- `url` text nullable
- `category` text nullable
- `city` text nullable
- `reason` text nullable
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

Indexes:
- `(list_type, domain)`
- `(list_type, url)`
- `(list_type, title)`

### Table: `venue_event_cache`

Columns:
- `id` BIGSERIAL PK
- `venue_domain` text
- `payload` jsonb
- `event_count` integer
- `last_updated` timestamptz
- `source_version` text

Indexes:
- `(venue_domain)`
- `(last_updated)`

## Migration Steps

1. Gate via env flag:
- `LIST_STORAGE_MODE=file|db` (default `file` until cutover)
2. Create table and indexes (auto-created at runtime when `LIST_STORAGE_MODE=db`).
3. Run one-time import script:
- `cd curate-events-api`
- `DATABASE_URL=... REPLACE=true npm run migrate:lists`
4. Implement dual-read validation in staging:
- compare file-backed and db-backed outputs for list endpoints
5. Cutover in staging (`LIST_STORAGE_MODE=db`), then production.
6. Keep file fallback for one release cycle.

## Rollback Plan

- Set `LIST_STORAGE_MODE=file`.
- Keep file snapshots committed for emergency fallback.
- Export DB lists to JSON/XLSX before schema changes.

## Acceptance Criteria

- List endpoints return identical logical results in `file` and `db` mode.
- Production edits persist across redeploys/restarts.
- No writes to local disk are required for runtime list changes.
