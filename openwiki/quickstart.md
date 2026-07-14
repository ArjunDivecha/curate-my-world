# OpenWiki Quickstart

Squirtle is a Bay Area event curation app with a React frontend and a Node/Express backend. It aggregates events from Ticketmaster and a venue-calendar scraper, normalizes them into shared categories, and exposes them through a filterable UI with list moderation and preview support.

Start here if you are new to the repository or need a safe map before changing code.

## What this repository is for
- Surface curated Bay Area events in the frontend dashboard.
- Fetch structured events from Ticketmaster and scraped venue calendars.
- Normalize, dedupe, filter, and cache events before they reach users.
- Support moderation workflows like whitelisting and blacklisting domains/events.
- Run a managed venue-discovery workflow that proposes new venue sources for the registry.

## Core subsystems
- Frontend app: `src/` with the dashboard, event cards, date views, and search/filter state.
- Backend API: `curate-events-api/` with event routes, health checks, preview proxy, and list management.
- Data files: `data/` contains the venue registry, scraped cache, candidate artifacts, and reports.
- SVDA tooling: `scripts/svda/` plus `docs/svda/` and `data/venue-candidates/` for managed-agent venue discovery.
- Operational docs: root docs such as `README.md`, `ENVIRONMENT.md`, and `PORT_MANAGEMENT.md`.

## Repository map
### Architecture
- [Architecture overview](architecture/overview.md) — frontend/backend/data flow, caching, scheduler, and source-of-truth files.

### Domain knowledge
- [Events and categories](domain/events-and-categories.md) — category model, provider rules, validation, and timezone handling.
- [Venue discovery and SVDA](domain/venue-discovery-and-svda.md) — registry workflow, scraper pipeline, candidate artifacts, and managed-agent setup.

### Workflows
- [Development workflow](workflows/development.md) — local start commands, port management, and common code-change paths.

### Operations
- [Runtime and deployment](operations/runtime-and-deployment.md) — env vars, cloud runtime, caching, refresh behavior, and safety notes.

### Integrations
- [Preview and lists](integrations/preview-and-lists.md) — preview proxy, whitelist/blacklist storage, and event action flows.

### Testing
- [Checks and verification](testing/checks.md) — the recommended commands to run after changes and what each one exercises.

## Important source files
- `package.json` — root scripts for dev, build, lint, start/stop, and benchmarking.
- `src/hooks/useDashboardLogic.ts` — main frontend state machine and auto-fetch behavior.
- `src/components/Dashboard.tsx` — dashboard shell and view switching.
- `curate-events-api/src/routes/events.js` — main event API and background-refresh orchestration.
- `curate-events-api/src/clients/TicketmasterClient.js` — Ticketmaster fetch and timezone conversion.
- `curate-events-api/src/clients/VenueScraperClient.js` — cached scraper-backed event source.
- `curate-events-api/src/utils/categoryMapping.js` — single source of truth for category mapping.
- `curate-events-api/src/utils/listManager.js` — whitelist/blacklist storage and reload logic.
- `curate-events-api/src/routes/preview.js` — preview proxy with allowlist and SSRF protections.
- `curate-events-api/src/utils/venueCacheDb.js` — Postgres-backed cache and run-history storage.
- `curate-events-api/scripts/scrape-venues.js` — daily venue scrape pipeline and extraction fallback logic.
- `data/venue-registry.json` — production venue registry.
- `data/venue-events-cache.json` — scraped venue events cache.
- `data/venue-candidates/schema.json` — schema for SVDA candidate runs.

## Good first reads before editing
- Read `architecture/overview.md` and `domain/events-and-categories.md` if you are changing event flow logic.
- Read `operations/runtime-and-deployment.md` before touching environment variables, deployment, or cache behavior.
- Read `integrations/preview-and-lists.md` before modifying event actions or moderation endpoints.
- Read `domain/venue-discovery-and-svda.md` before changing scraper or managed-agent automation.

## Existing docs worth keeping in mind
- `README.md` is the main product overview, though its category count is stale (source has 12, README lists 10).
- `.claude/CLAUDE.md` contains deep developer-facing architecture notes and commands, though some details (category count, scheduler timing) are outdated — verify against source.
- `ENVIRONMENT.md` and `PORT_MANAGEMENT.md` capture operational conventions.
- `docs/svda/` documents the managed-agent venue discovery setup.

## Notes for future agents
- The live backend is routed through the `curate-events-api` package, not the root `src/` tree.
- Category behavior is centralized; prefer `curate-events-api/src/utils/categoryMapping.js` over local one-off mappings.
- The venue scraper is cache-first; avoid introducing request-time scraping in API handlers.
- The preview endpoint is intentionally restricted; preserve its host allowlist and private-host checks.
- Treat `README.md` and `CLAUDE.md` as living references, but verify against source before changing behavior.
