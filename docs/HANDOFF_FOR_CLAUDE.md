# Project Handoff (Current State)

This note captures where things stand so you can pick up cleanly.

## TL;DR
- Main app is back on the stable, legacy pipeline by default. The Fetch Events button should work without errors.
- A separate “Super‑Hybrid” experiment (Exa + Serper + Sonoma) exists and is callable on demand via `mode=super-hybrid`.
- A rules system (whitelist domain, blacklist path/domain) is implemented for the experiment and proxied through the backend so the existing UI can update it.

## Default Runtime
- Backend: `http://127.0.0.1:8765`
- Frontend dev: `http://127.0.0.1:8766`
- Default pipeline: legacy (no experiment unless explicitly requested).

Start/Stop from repo root:
- `./stop-everything.sh`
- `./start-everything.sh`

## Super‑Hybrid Experiment (separate)
- Server: `experiments/super-hybrid/server.js` → `http://127.0.0.1:8799`
- Endpoints:
  - `GET /health`
  - `GET /super-hybrid/search?location=&limit=&categories=` (Full: Turbo+Deep)
  - `GET /super-hybrid/turbo?location=&limit=` (Turbo only)
  - `GET /super-hybrid/stream?location=&limit=&categories=` (SSE)
  - Rules: `GET /rules`, `POST /rules/whitelist`, `POST /rules/blacklist`
- Mini UI (experiment): `http://127.0.0.1:8799/` (search, stream, and whitelist/blacklist per card).

## Super‑Hybrid via Main Backend (proxy)
- Disabled by default for stability.
- To call: `GET /api/events/all-categories?...&mode=super-hybrid`
  - Tries Full first, then Turbo, then falls back to legacy if needed.
- Rules proxy (for UI):
  - `GET /api/rules`
  - `POST /api/rules/whitelist` → `{ domain }`
  - `POST /api/rules/blacklist` → `{ domain, mode: 'path'|'domain', path? }`

## Rules System
- File: `experiments/speed-demon/rules.json`
  - `global.blockPathTokens`: generic listing/schedule tokens
  - `domains[].allowPaths`: regex for event‑detail slugs
  - `domains[].blockPaths`: regex for calendars/listings
  - `domains[].penalizeWords`: optional downrank list
- Applied in:
  - Turbo: `experiments/speed-demon/speed-collector.js` (scoring + less aggressive drop)
  - Deep: `experiments/super-hybrid/sonoma_bridge.py` (filter before emit)
- Venue enrichment heuristics in both to reduce “Venue TBD”.

## Frontend Card Controls
- `src/components/EventCard.tsx`: added per-card buttons
  - Whitelist Domain
  - Blacklist Path (regex prompt)
  - Blacklist Domain
- Calls `/api/rules/...` (backend proxy) so no CORS issues.

## Config
- Backend config points to experiment server: `config.superHybrid.url = http://127.0.0.1:8799`
- Super‑Hybrid not default anymore (requires `mode=super-hybrid`).

## Environment Keys
- `curate-events-api/.env` should have:
  - `PERPLEXITY_API_KEY` (legacy)
  - `EXA_API_KEY`, `SERPER_API_KEY` (experiment)

## Key Code Paths
- Backend proxy & toggle: `curate-events-api/src/routes/events.js`
- Rules proxy: `curate-events-api/src/routes/rules.js`
- Config: `curate-events-api/src/utils/config.js`
- Experiment server: `experiments/super-hybrid/server.js`
- Turbo: `experiments/speed-demon/speed-collector.js`
- Sonoma bridge: `experiments/super-hybrid/sonoma_bridge.py`
- Rules: `experiments/speed-demon/rules.json`
- Frontend per-card rules controls: `src/components/EventCard.tsx`

## Why defaults reverted
- Turbo can occasionally return zero if rules over‑filter listings and allowPaths aren’t broad enough yet.
- To avoid “0 events,” default reverted to legacy until Turbo allowPaths are tuned for top venues.

## Suggested next steps
1) Expand `rules.json` allowPaths for common venue detail slugs (Greek Theatre, Playhouse, Curran, SFJAZZ, Warfield, Fox Oakland, etc.).
2) Consider adding a streaming proxy in the backend for incremental Turbo→Deep delivery without UI rewrites.
3) Pre‑index (hourly) top venues to warm the Super‑Hybrid cache.
4) When Turbo is reliable, consider making Super‑Hybrid default again.

---
This gives a stable base and a clear experimental path to iterate without breaking the main UI.
