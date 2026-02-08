# Squirtle - AI-Powered Bay Area Event Curation

> **Personalized event discovery for the San Francisco Bay Area, powered by Ticketmaster + venue calendar scraping**

## What Is Squirtle

Squirtle is a local event curation system that aggregates events from two complementary sources — Ticketmaster (for major ticketed events) and a venue calendar scraper (for independent/local venues) — and presents them in a clean, searchable dashboard organized by category.

**Key features:**
- **Two-source aggregation**: Ticketmaster API (backbone) + venue calendar scraper (gap filler)
- **9 event categories**: Music, Theatre, Comedy, Movies, Art, Food, Tech, Lectures, Kids
- **Event search**: Filter displayed events by title, venue, description, or address
- **Event moderation**: Block individual events or entire domains from appearing
- **Quality gate**: Event validator rejects listing pages, out-of-area events, and placeholder entries
- **Central category normalization**: 40+ aliases ensure events land in the right bucket
- **Bay Area focus**: Geographic filtering for 60+ cities in the SF Bay Area

## Architecture

```
Frontend (React + TypeScript + Vite, port 8766)
    ↓
Backend API (Node.js + Express, port 8765)
    ├── Layer 1: Ticketmaster API (backbone - structured, ticketed events)
    ├── Layer 2: Venue Calendar Scraper (gap filler - 286 local venues)
    └── Layer 3: Event Validator (quality gate on all events)
```

### Three-Layer Event Pipeline

**Layer 1 — Ticketmaster API (backbone)**
- ~1,600+ structured Bay Area events with real prices, URLs, dates
- Covers: Music (800+), Arts/Theatre (400+), Sports (200+), Film, Misc
- Built-in location filtering via DMA and lat/long

**Layer 2 — Venue Calendar Scraper (gap filler)**
- Scrapes 286 Bay Area venue websites via Jina Reader + Claude Haiku
- Fills gaps Ticketmaster doesn't cover: galleries, independent theatres, food events, tech meetups
- Cache file: `data/venue-events-cache.json` (~800 events from 284 venues)
- Cloud durability: when `DATABASE_URL` is set (Railway), cache is also persisted to Postgres (`venue_events_cache`) so it survives redeploys/restarts
- Stale-while-revalidate: auto-refreshes when cache > 24h old

**Layer 3 — Event Validator (quality gate)**
- Rejects listing/calendar pages (URLs ending in /events/, /calendar/, etc.)
- Rejects events without dates or with placeholder venues
- Filters out non-Bay Area events
- Applied to ALL events from all sources

### Categorization System

Single source of truth: `categoryMapping.js` with `normalizeCategory()` function

**9 Supported Categories:**
| Category | Ticketmaster | Venue Scraper | Notes |
|----------|-------------|---------------|-------|
| Music | Segment: Music | Yes | Concerts, live music, festivals |
| Theatre | Segment: Arts & Theatre (Theatre genre) | Yes | Plays, musicals, opera, dance |
| Comedy | Segment: Arts & Theatre (Comedy genre) | Yes | Stand-up, improv |
| Movies | Segment: Film | Yes | Screenings, premieres |
| Art | **Not supported** | Yes | TM "Arts & Theatre" is theatre/comedy, not visual art |
| Food | Not supported | Yes | Culinary events, wine tastings |
| Tech | Not supported | Yes | Meetups, hackathons, AI conferences |
| Lectures | Segment: Miscellaneous (Lecture genre) | Yes | Talks, seminars, workshops |
| Kids | Segment: Miscellaneous (Family genre) | Yes | Family events, children's activities |

**Key normalization aliases:** `theater`→`theatre`, `performing arts`→`theatre`, `concert`→`music`, `film`→`movies`, `standup`→`comedy`, `family`→`kids`, `gallery`→`art`, `workshop`→`lectures`

## Data Sources

### Ticketmaster Discovery API
- **Status**: Active (primary source)
- **API Key**: `TICKETMASTER_CONSUMER_KEY` (required at startup)
- **Performance**: ~1-2 seconds per category request
- **Coverage**: ~1,600+ Bay Area events across music, theatre, comedy, sports, film

### Venue Calendar Scraper
- **Status**: Active (supplementary source)
- **Registry**: 286 Bay Area venues in `data/venue-registry.json`
- **How it works**: Jina Reader fetches venue calendar pages → Claude Haiku extracts structured events
- **Cache**:
  - File: `data/venue-events-cache.json`
  - DB (when `DATABASE_URL` set): Postgres `venue_events_cache`
- **Cost**: ~$0.05 per full 286-venue scrape
- **Refresh**:
  - Local/manual: `npm run scrape:venues`
  - DB-backed (recommended in cloud): `npm run scrape:venues:db`
  - Automatic: API spawns a background scrape when cache > 24h old (stale-while-revalidate)
- **Retry failed**: `npm run scrape:retry` re-scrapes only venues that errored

### Adding New Venues

Edit `data/venue-registry.json` and add an entry:

```json
{
  "name": "Venue Name",
  "domain": "venuename.com",
  "category": "music",
  "city": "San Francisco",
  "state": "CA",
  "website": "https://venuename.com",
  "calendar_url": "https://venuename.com/events"
}
```

Then run `npm run scrape:venues` (or `npm run scrape:retry` after marking the new venue as `"status": "error"` in the cache) to populate events from the new venue.

**Key fields:**
- `calendar_url` — The page listing the venue's upcoming events (what Jina Reader fetches)
- `category` — Default category fallback if the scraper can't determine one
- `domain` — Unique key in the cache (must match the website domain)

### Removed Providers (pre-Feb 2026)
The following providers were removed during the v2.0 architecture overhaul:
- Perplexity LLM (hallucinated event details)
- Perplexity Search / Serper (returned listing pages, not events)
- Exa API (low quality results)
- Apyflux (API issues, discontinued)
- SerpAPI (Google Events endpoint unreliable)
- Super-Hybrid experiment (deprecated)

## Frontend Features

### Dashboard
- Category tabs to filter by event type (All, Music, Theatre, Comedy, etc.)
- Search box to filter events by title, venue, description, or address
- Date picker to filter by date
- "Fetch Events" button to reload from the API
- Events displayed as cards in a responsive grid

### Event Cards
Each event card shows:
- Title, date, time, venue, description
- Category and source badges (ticketmaster / venue_scraper)
- "Event Page" link to the original event URL
- "Save to Calendar" button
- Share button
- **Block Event** — blacklist a specific event so it never appears again
- **Block Site** — blacklist an entire domain (all events from that site hidden)

### Event Moderation (Blacklist)
The blacklist system lets you hide unwanted events:
- **Block Event**: Hides one specific event by title/URL
- **Block Site**: Hides ALL events from a domain permanently
- Blacklist persists across refreshes via the backend API
- Managed through `/api/lists/` endpoints

## Quick Start

### Prerequisites
- Node.js >= 18
- Ticketmaster API key ([get one here](https://developer.ticketmaster.com/))
- Anthropic API key (for venue scraper's Claude Haiku extraction)
- Jina Reader (free, no key needed — `https://r.jina.ai`)

### Setup

```bash
# Clone and install
git clone https://github.com/ArjunDivecha/curate-my-world
cd curate-my-world

# Frontend
npm install

# Backend
cd curate-events-api
npm install
cp .env.example .env  # Then add your API keys
```

### Environment Variables (`curate-events-api/.env`)

```bash
# REQUIRED — Ticketmaster is the backbone
TICKETMASTER_CONSUMER_KEY=your_ticketmaster_key

# RECOMMENDED — For venue scraper (Claude Haiku extraction)
ANTHROPIC_API_KEY=your_anthropic_key

# Server
NODE_ENV=development
PORT=8765
HOST=127.0.0.1
```

### Run

```bash
# Start backend (from curate-events-api/)
npm run dev                  # Development with --watch
npm start                    # Production

# Start frontend (from project root)
npm run dev                  # Vite dev server on port 8766

# Or start everything
./scripts/start-all.sh
```

### Populate Venue Scraper Cache

```bash
cd curate-events-api
npm run scrape:venues        # Full scrape of all 286 venues (~15 min)
npm run scrape:retry         # Retry only failed venues
```

## Current Live Deployment (Feb 2026)

This repo is currently deployed and working. The simplest operational rule is: **leave Railway as-is unless you are intentionally changing production infrastructure**.

### URLs

- Frontend (Vercel): `https://squirtle-eta.vercel.app`
- Backend API (Railway, currently running from the `staging` environment): `https://squirtle-api-staging.up.railway.app`
  - Health: `https://squirtle-api-staging.up.railway.app/api/health`

### Source Of Truth (What Is Deployed)

Railway staging backend deploy metadata (confirmed via Railway API):

- Repo: `ArjunDivecha/curate-my-world`
- Branch: `main`
- Commit: `32869445547086abab57c06a9468b8f59181aa97` (merge commit `3286944`)

### Required Cloud Env Vars (Backend)

On Railway `squirtle-api` (staging environment), expect at minimum:

- `NODE_ENV=production`
- `FRONTEND_URL=https://squirtle-eta.vercel.app` (CORS allow-origin)
- `TICKETMASTER_CONSUMER_KEY=...`
- `DATABASE_URL=...` (Railway Postgres)
- `LIST_STORAGE_MODE=db`

### Required Cloud Env Vars (Frontend)

On Vercel (production), ensure:

- `VITE_API_BASE_URL=https://squirtle-api-staging.up.railway.app/api`

### Critical Safety Notes (Railway UI)

- The Railway `production` environment for this project is currently empty. The site is backed by Railway `staging`.
- **Do not use Railway “Sync/Merge changes from production into staging”** unless you are certain of the diff. It can propose deleting services in staging.
- Do not paste API tokens/keys into chat. Create short-lived tokens for admin automation and revoke them after.

## API Endpoints

### Events (port 8765)

| Endpoint | Description |
|----------|-------------|
| `GET /api/events/all-categories` | All events grouped by category |
| `GET /api/events/:category` | Events for a specific category |
| `GET /api/events/categories` | List supported categories |

**Query Parameters:**
- `location` — Location string (default: San Francisco Bay Area)
- `limit` — Max events per provider (default: 50)
- `providers` — Comma-separated: `ticketmaster,venue_scraper`
- `date` — Date filter (ISO format)

**Example:**
```bash
curl "http://127.0.0.1:8765/api/events/music?location=San%20Francisco&limit=20&providers=ticketmaster,venue_scraper"
```

### Event Moderation

| Endpoint | Description |
|----------|-------------|
| `GET /api/lists/` | View all lists (whitelist + blacklists) |
| `POST /api/lists/blacklist-event` | Block a specific event |
| `DELETE /api/lists/blacklist-event` | Unblock a specific event |
| `POST /api/lists/blacklist-site` | Block all events from a domain |
| `DELETE /api/lists/blacklist-site` | Unblock a domain |

### Health

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Basic health check |
| `GET /api/health/deep` | Detailed health with provider status |

### Response Format

```json
{
  "success": true,
  "eventsByCategory": {
    "Music": [...],
    "Theatre": [...],
    "Comedy": [...]
  },
  "categoryStats": { "Music": 50, "Theatre": 20 },
  "totalEvents": 150,
  "processingTime": "1.2s",
  "providerStats": [...],
  "providerDetails": [...]
}
```

### Event Format

```json
{
  "id": "unique-id",
  "title": "Event Name",
  "description": "...",
  "startDate": "2026-02-15T20:00:00",
  "endDate": "2026-02-15T22:00:00",
  "venue": { "name": "The Fillmore", "address": "1805 Geary Blvd" },
  "category": "music",
  "price": "$45-$85",
  "ticketUrl": "https://...",
  "eventUrl": "https://...",
  "source": "ticketmaster"
}
```

## Project Structure

```
curate-my-world/
├── src/                              # Frontend (React + TypeScript)
│   ├── components/
│   │   ├── Dashboard.tsx             # Main dashboard with search and category tabs
│   │   ├── EventCard.tsx             # Event card with block/share/calendar actions
│   │   ├── WeeklyCalendar.tsx        # Calendar view
│   │   └── ui/                       # shadcn/ui primitives
│   ├── hooks/
│   ├── lib/
│   └── utils/
├── curate-events-api/                # Backend (Node.js + Express)
│   ├── src/
│   │   ├── clients/
│   │   │   ├── TicketmasterClient.js # Ticketmaster Discovery API
│   │   │   └── VenueScraperClient.js # Cache reader + stale-while-revalidate
│   │   ├── routes/
│   │   │   ├── events.js             # Main API routes (three-layer pipeline)
│   │   │   ├── health.js             # Health check endpoints
│   │   │   └── lists.js              # Blacklist/whitelist management
│   │   └── utils/
│   │       ├── categoryMapping.js    # Single source of truth for categories
│   │       ├── eventValidator.js     # Quality gate (rejects listing pages)
│   │       ├── locationFilter.js     # Bay Area geographic filtering
│   │       ├── dateFilter.js         # Date range filtering
│   │       ├── listManager.js        # Blacklist persistence
│   │       ├── config.js             # Environment configuration
│   │       └── eventDeduplicator.js  # Cross-source dedup
│   ├── scripts/
│   │   └── scrape-venues.js          # Jina Reader + Claude Haiku scraper
│   └── package.json
├── data/
│   ├── venue-registry.json           # 286 Bay Area venues with calendar URLs
│   └── venue-events-cache.json       # Scraped events cache (~800 events)
└── scripts/
    └── start-all.sh                  # Start frontend + backend
```

## Key Files

| File | Purpose |
|------|---------|
| `curate-events-api/src/routes/events.js` | Main API routes — three-layer event pipeline |
| `curate-events-api/src/routes/lists.js` | Blacklist/whitelist management API |
| `curate-events-api/src/utils/categoryMapping.js` | Category normalization (40+ aliases) |
| `curate-events-api/src/clients/VenueScraperClient.js` | Reads venue cache, stale-while-revalidate |
| `curate-events-api/src/utils/eventValidator.js` | Quality gate — rejects listing pages |
| `curate-events-api/scripts/scrape-venues.js` | Venue scraper (Jina + Claude Haiku) |
| `data/venue-registry.json` | 286 Bay Area venue definitions |
| `data/venue-events-cache.json` | Scraped events cache |
| `src/components/Dashboard.tsx` | Frontend dashboard with search and categories |
| `src/components/EventCard.tsx` | Event card with block/share/calendar actions |

## Event Pipeline Flow

```
1. Frontend sends request: GET /api/events/all-categories?providers=ticketmaster,venue_scraper

2. Backend fetches from enabled providers in parallel:
   ├── Ticketmaster: API call with category/location filters
   └── Venue Scraper: reads local cache (instant)

3. All events pass through pipeline:
   ├── Deduplication (cross-source)
   ├── Rules filter
   ├── Blacklist filter (blocked events/domains removed)
   ├── Event Validator (quality gate)
   ├── Location filter (Bay Area)
   ├── Date filter
   └── Category filter (normalizeCategory)

4. Events grouped by category, returned to frontend

5. Frontend filters further by search query if one is entered
```

## Development

### Testing
```bash
cd curate-events-api
npm test                     # Jest tests
npm run test:watch           # Watch mode

# Manual API testing
curl http://127.0.0.1:8765/api/health
curl "http://127.0.0.1:8765/api/events/theatre?location=San+Francisco"
```

### Port Management
```bash
npm run port:status          # Check port usage
npm run port:cleanup         # Kill processes on 8765/8766
npm run stop                 # Clean shutdown
```

### Venue Scraper Management
```bash
npm run scrape:venues        # Full scrape (all 286 venues, ~15 min)
npm run scrape:retry         # Retry only failed venues
```

The scraper uses:
- **Jina Reader** (`https://r.jina.ai/{url}`) to render JS-heavy pages → clean markdown
- **Claude Haiku** (`claude-haiku-4-5-20251001`) to extract structured events from markdown
- **60-second timeout** per venue (some JS-heavy sites need 35-45s)
- **Incremental writes** — saves after each venue, recoverable on crash

## Security

- All API keys in `curate-events-api/.env` (git-ignored)
- Only `TICKETMASTER_CONSUMER_KEY` is required at startup
- Helmet, CORS, rate limiting middleware on backend
- No sensitive data in logs

---

**Last Updated**: February 7, 2026
**System Status**: Production Ready
**Architecture**: v2.0 — Three-layer pipeline (Ticketmaster + Venue Scraper + Validator)
**Active Providers**: Ticketmaster (backbone) + Venue Scraper (286 venues, ~800 cached events)
