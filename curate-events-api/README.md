# Curate Events API

Node.js Express backend for Squirtle event curation. Aggregates events from Ticketmaster and a venue calendar scraper, applies quality validation, and serves them to the frontend.

## Architecture

```
Frontend → Express API Server
              ├── Ticketmaster Discovery API (backbone)
              ├── Venue Scraper Cache Reader (gap filler)
              └── Event Validator (quality gate)
```

## Quick Start

```bash
npm install
cp .env.example .env       # Add your TICKETMASTER_CONSUMER_KEY
npm run dev                 # Starts on port 8765 with --watch
```

## Environment Variables

```bash
# REQUIRED
TICKETMASTER_CONSUMER_KEY=your_key    # Backbone provider, validated at startup

# RECOMMENDED
ANTHROPIC_API_KEY=your_key            # For venue scraper (Claude Haiku extraction)

# OPTIONAL
NODE_ENV=development
PORT=8765
HOST=127.0.0.1
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/events/all-categories` | All events grouped by category |
| `GET /api/events/:category` | Events for a specific category |
| `GET /api/events/categories` | List supported categories |
| `GET /api/health` | Basic health check |
| `GET /api/health/deep` | Detailed health with provider status |

**Query Parameters:**
- `location` — Location string (default: San Francisco Bay Area)
- `limit` — Max events per provider (default: 50)
- `providers` — Comma-separated: `ticketmaster,venue_scraper,whitelist`
- `date` — Date filter (ISO format)

## Project Structure

```
curate-events-api/
├── src/
│   ├── clients/
│   │   ├── TicketmasterClient.js    # Ticketmaster Discovery API
│   │   ├── VenueScraperClient.js    # Cache reader + stale-while-revalidate
│   │   └── WhitelistClient.js       # Legacy whitelist (disabled by default)
│   ├── routes/
│   │   ├── events.js                # Main API routes (three-layer pipeline)
│   │   └── health.js                # Health check endpoints
│   ├── utils/
│   │   ├── categoryMapping.js       # Category normalization (single source of truth)
│   │   ├── eventValidator.js        # Quality gate (rejects listing pages)
│   │   ├── locationFilter.js        # Bay Area geographic filtering
│   │   ├── dateFilter.js            # Date range filtering
│   │   ├── eventDeduplicator.js     # Cross-source dedup
│   │   ├── config.js                # Environment configuration
│   │   ├── rulesFilter.js           # Custom rules filtering
│   │   ├── listManager.js           # Blacklist management
│   │   ├── cache.js                 # Request caching
│   │   └── logger.js                # Winston logging
│   └── server.js                    # Express server entry point
├── scripts/
│   └── scrape-venues.js             # Jina Reader + Claude Haiku venue scraper
├── tests/
├── package.json
└── .env.example
```

## Venue Scraper

The venue scraper populates `data/venue-events-cache.json` by:
1. Reading 286 venue definitions from `data/venue-registry.json`
2. Fetching each venue's calendar page via Jina Reader (`https://r.jina.ai/{url}`)
3. Sending the markdown to Claude Haiku for structured event extraction
4. Saving results incrementally to the cache file

```bash
npm run scrape:venues        # Full scrape (~15 min, ~$0.05)
npm run scrape:retry         # Retry only failed venues
```

The `VenueScraperClient` reads this cache at request time (instant, no network calls) and triggers a background refresh when the cache is > 24h old (stale-while-revalidate).

## Categories

9 supported categories defined in `categoryMapping.js`:

| Category | TM Supported | Description |
|----------|-------------|-------------|
| music | Yes | Concerts, live music, festivals |
| theatre | Yes | Plays, musicals, opera, dance |
| comedy | Yes | Stand-up, improv |
| movies | Yes | Film screenings, premieres |
| art | **No** | Galleries, exhibitions, museums |
| food | No | Culinary events, wine tastings |
| tech | No | Meetups, hackathons, conferences |
| lectures | Yes | Talks, seminars, workshops |
| kids | Yes | Family events, children's activities |

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start with --watch |
| `npm test` | Run Jest tests |
| `npm run scrape:venues` | Full venue scrape |
| `npm run scrape:retry` | Retry failed venues |
| `npm run lint` | ESLint |

---

**Last Updated**: February 2026
**Architecture**: v2.0 — Three-layer pipeline
