# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**Squirtle** is a Bay Area event curation system with a three-layer event pipeline:

- **Frontend**: React + TypeScript + Vite (port 8766)
- **Backend API**: Node.js Express (port 8765)
- **Data Sources**: Ticketmaster API (backbone) + Venue Calendar Scraper (gap filler)
- **Quality Gate**: Event Validator rejects listing pages, out-of-area events, and bad data

## Essential Commands

### Development
```bash
# Start everything
./scripts/start-all.sh

# Individual services
npm run dev                              # Frontend (Vite dev server, port 8766)
cd curate-events-api && npm run dev      # Backend (Node.js --watch, port 8765)
```

### Venue Scraper
```bash
cd curate-events-api
npm run scrape:venues      # Full scrape of all 286 venues
npm run scrape:retry       # Retry only failed venues
```

### Testing & Health
```bash
cd curate-events-api
npm test                   # Jest tests
npm run test:watch         # Watch mode

# Health checks
curl http://127.0.0.1:8765/api/health
curl http://127.0.0.1:8765/api/health/deep
```

### Port Management
```bash
npm run port:status        # Check port usage
npm run port:cleanup       # Kill processes on 8765/8766
npm run stop               # Clean shutdown
```

## Architecture

### Three-Layer Event Pipeline

```
Frontend → Backend API → Postgres cache (instant read)
                         ↑ populated by background scheduler daily at 6:00 AM PT
                         ↑ scheduler uses: Layer 1 + Layer 2 + Layer 3

Background scheduler → Layer 1: Ticketmaster (backbone)
                     → Layer 2: Venue Scraper (cache reader)
                     → Layer 3: Event Validator (quality gate)
                     → writes result to Postgres
```

The `/all-categories` endpoint **never** makes live TM API calls. It always reads from a Postgres-backed cache that is refreshed by a background scheduler daily at 6:00 AM PT (`America/Los_Angeles`), with request-time fallback refresh if cache age exceeds 24 hours.

All events pass through: **dedup → rules filter → blacklist → eventValidator → locationFilter → dateFilter → categoryFilter**

### Providers (in events.js)
| Provider | Default | Description |
|----------|---------|-------------|
| `ticketmaster` | ON | Ticketmaster Discovery API — ~1,600+ events |
| `venue_scraper` | ON | Reads `data/venue-events-cache.json` — ~800+ events |
| `whitelist` | OFF | Legacy whitelist search (disabled by default) |

Frontend sends `providers=ticketmaster,venue_scraper` query param.

### Removed Providers (pre-Feb 2026)
Perplexity LLM, Perplexity Search, Serper, Exa, Apyflux, SerpAPI, Super-Hybrid — all removed.

### Categorization System
**Single source of truth**: `categoryMapping.js` → `normalizeCategory()` with 40+ aliases

9 categories: `music`, `theatre`, `comedy`, `movies`, `art`, `food`, `tech`, `lectures`, `kids`

Key rules:
- `art` category: TM config set to `null` (TM "Arts & Theatre" is theatre/comedy, NOT visual art)
- VenueScraperClient normalizes categories on read via `normalizeCategory()`
- events.js uses `normalizeCategory()` for bucket filtering
- Frontend cache key: `cmw_events_cache_v3` (bump when backend changes categories)

## Key Files

### Backend
| File | Purpose |
|------|---------|
| `curate-events-api/src/routes/events.js` | Main API routes — cache-first + background scheduler |
| `curate-events-api/src/utils/venueCacheDb.js` | Postgres helpers: venue cache + all-categories response cache |
| `curate-events-api/src/utils/categoryMapping.js` | Category normalization (single source of truth) |
| `curate-events-api/src/clients/TicketmasterClient.js` | Ticketmaster Discovery API client |
| `curate-events-api/src/clients/VenueScraperClient.js` | Cache reader + stale-while-revalidate |
| `curate-events-api/src/utils/eventValidator.js` | Quality gate (rejects listing URLs) |
| `curate-events-api/src/utils/locationFilter.js` | Bay Area geographic filtering |
| `curate-events-api/scripts/scrape-venues.js` | Jina Reader + Claude Haiku scraper |
| `curate-events-api/src/utils/config.js` | Environment configuration |

### Data
| File | Purpose |
|------|---------|
| `data/venue-registry.json` | 286 Bay Area venues with calendar URLs |
| `data/venue-events-cache.json` | Scraped events cache (~800+ events) |

### Frontend
| File | Purpose |
|------|---------|
| `src/components/Dashboard.tsx` | Main dashboard with search, category tabs |
| `src/components/EventCard.tsx` | Individual event display |
| `src/components/ProviderControlPanel.tsx` | Toggle ticketmaster/venue_scraper |
| `src/components/WeeklyCalendar.tsx` | Calendar view |

## Environment Variables

### Required (`curate-events-api/.env`)
```bash
TICKETMASTER_CONSUMER_KEY=     # REQUIRED — backbone provider, validated at startup
```

### Recommended
```bash
ANTHROPIC_API_KEY=             # For venue scraper (Claude Haiku extraction)
```

### Optional
```bash
NODE_ENV=development
PORT=8765
HOST=127.0.0.1
TICKETMASTER_CONSUMER_SECRET=  # Not currently used
JINA_READER_URL=               # Default: https://r.jina.ai
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/events/all-categories` | All events grouped by category |
| `GET /api/events/:category` | Events for a specific category |
| `GET /api/events/categories` | List supported categories |
| `GET /api/health` | Basic health check |
| `GET /api/health/deep` | Detailed health with provider status |

Query params: `location`, `limit`, `providers` (comma-separated), `date`

## Development Workflow

### Before Making Changes
1. Check API health: `curl http://127.0.0.1:8765/api/health`
2. Understand the three-layer pipeline before modifying events.js
3. Category changes go in `categoryMapping.js` only (single source of truth)

### Adding a New Category
1. Add to `CATEGORY_CONFIG` in `categoryMapping.js`
2. Add to `SUPPORTED_CATEGORIES` array
3. Add aliases to `normalizeCategory()` if needed
4. Bump frontend cache key in Dashboard.tsx

### Modifying Venue Scraper
1. Venue URLs are in `data/venue-registry.json`
2. Scraper script: `curate-events-api/scripts/scrape-venues.js`
3. Cache reader: `curate-events-api/src/clients/VenueScraperClient.js`
4. After fixing URLs, mark venues as `"status": "error"` in cache, then `npm run scrape:retry`

### Event Pipeline Order (in events.js)
```
Provider fetch → dedup → rules filter → blacklist → eventValidator → locationFilter → dateFilter → categoryFilter
```

## Critical Files (Require Permission Before Modification)
- `curate-events-api/.env` — API keys
- `curate-events-api/src/routes/events.js` — Main pipeline logic
- `curate-events-api/src/utils/categoryMapping.js` — Category definitions
- `data/venue-registry.json` — Venue definitions

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Port conflicts | `npm run port:cleanup` |
| No events showing | Wait ~30s after deploy for background scheduler to populate cache, then check `/api/health/deep` |
| Venue scraper empty | Run `npm run scrape:venues` to populate cache |
| Events in wrong category | Check `normalizeCategory()` in categoryMapping.js |
| Valid events filtered out | Check `eventValidator.js` listing URL patterns |
| Stale venue data | `npm run scrape:retry` or full `npm run scrape:venues` |

---

**Last Updated**: February 2026
**Architecture**: v2.0 — Three-layer pipeline
**Active Providers**: Ticketmaster + Venue Scraper (286 venues)
