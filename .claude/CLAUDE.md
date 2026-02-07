# Project Instructions for Curate My World

## CORE RULES - ALWAYS FOLLOW THESE

### Project Context
- **ALWAYS CHECK THE README FIRST** before starting any work
- Understand the three-layer event pipeline before making changes
- Category changes go in `categoryMapping.js` ONLY (single source of truth)

### Project Structure
- **Frontend**: React/TypeScript in `/src/` (port 8766)
- **Backend API**: Node.js/Express in `/curate-events-api/` (port 8765)
- **Data files**: Venue registry and event cache in `/data/`
- **Configuration**: API keys in `curate-events-api/.env` (NOT in git)

### Architecture (v2.0 — Feb 2026)
Three-layer event pipeline:
1. **Ticketmaster API** (backbone) — ~1,600+ structured Bay Area events
2. **Venue Calendar Scraper** (gap filler) — 286 venues, ~800+ cached events
3. **Event Validator** (quality gate) — rejects listing pages, bad data, out-of-area

**Removed providers**: Perplexity, Exa, Apyflux, SerpAPI, Serper, Super-Hybrid

### Data Sources
| Provider | Status | Default | Key |
|----------|--------|---------|-----|
| Ticketmaster | Active (backbone) | ON | `TICKETMASTER_CONSUMER_KEY` (required) |
| Venue Scraper | Active (gap filler) | ON | No key needed (reads local cache) |
| Whitelist | Legacy | OFF | No key needed |

### Categorization
- **Single source of truth**: `categoryMapping.js` → `normalizeCategory()` (40+ aliases)
- 9 categories: music, theatre, comedy, movies, art, food, tech, lectures, kids
- `art` has no TM mapping (TM "Arts & Theatre" is theatre/comedy, NOT visual art)
- Frontend cache key: `cmw_events_cache_v3`

### Testing
```bash
curl http://127.0.0.1:8765/api/health           # Health check
curl http://127.0.0.1:8765/api/health/deep       # Deep health
curl "http://127.0.0.1:8765/api/events/music?location=San+Francisco"  # Test fetch
```

### Critical Files — DO NOT MODIFY WITHOUT PERMISSION
- `curate-events-api/.env` (API keys)
- `curate-events-api/src/routes/events.js` (three-layer pipeline)
- `curate-events-api/src/utils/categoryMapping.js` (category definitions)
- `data/venue-registry.json` (286 venue definitions)

### Key Commands
```bash
npm run dev                    # Frontend dev server
cd curate-events-api && npm run dev  # Backend dev server
npm run scrape:venues          # Full venue scrape
npm run scrape:retry           # Retry failed venues only
npm run port:cleanup           # Free ports 8765/8766
```

## Development Guidelines

### File Management
- **DO NOT DELETE FILES OR MOVE FILES WITHOUT EXPLICIT PERMISSION**
- **DO NOT DO ANYTHING I DIDN'T ASK YOU TO DO**
- Always use Read tool before Edit/Write operations
- Prefer editing existing files over creating new ones

### Code Quality
- **NO SIMULATED CODE** — if you can't make it work, just say so
- **FAIL IS FAIL** — do not create fallbacks without explicit permission
- Document everything clearly
- Test changes before committing

### Event Pipeline (events.js)
All events flow through:
```
Provider fetch → dedup → rules filter → blacklist → eventValidator → locationFilter → dateFilter → categoryFilter
```

---

**Project Status**: Production Ready
**Architecture**: v2.0 — Three-layer pipeline (Ticketmaster + Venue Scraper + Validator)
**Last Updated**: February 2026
