# Environment Variables

Configuration for the Curate My World (Squirtle) application.

## Backend (`curate-events-api/.env`)

### Required
| Variable | Description |
|----------|-------------|
| `TICKETMASTER_CONSUMER_KEY` | Ticketmaster Discovery API key — backbone provider, validated at startup |

### Recommended
| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key — used by venue scraper for Claude Haiku event extraction |

### Optional
| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `8765` | Backend server port |
| `HOST` | `127.0.0.1` | Server bind address (production uses `0.0.0.0`) |
| `TICKETMASTER_CONSUMER_SECRET` | — | Not currently used |
| `JINA_READER_URL` | `https://r.jina.ai` | Jina Reader base URL for venue scraping |
| `LOG_LEVEL` | `debug` (dev) / `info` (prod) | Winston log level |
| `FRONTEND_URL` | — | Frontend URL for CORS in production |

### Legacy (not required)
| Variable | Description |
|----------|-------------|
| `PERPLEXITY_API_KEY` | Removed provider — no longer used |
| `EXA_API_KEY` | Removed provider — no longer used |
| `SERPER_API_KEY` | Removed provider — no longer used |
| `SERPAPI_API_KEY` | Removed provider — no longer used |
| `APYFLUX_API_KEY` | Removed provider — no longer used |

## Frontend (`.env` in project root)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | For conversation analysis features |
| `VITE_SUPABASE_URL` | Supabase project URL (if using Supabase) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key (if using Supabase) |

## Setup

### Development

```bash
# Backend
cd curate-events-api
cp .env.example .env
# Edit .env and add your TICKETMASTER_CONSUMER_KEY

# Frontend (optional — Supabase features)
cp .env.example .env
# Edit .env and add keys if needed
```

### Startup Validation

The backend validates configuration on startup:
- **Critical**: `TICKETMASTER_CONSUMER_KEY` must be set (server won't start without it)
- **Warning**: Missing optional keys are logged but don't prevent startup
- **Warning**: Missing venue events cache prompts a reminder to run `npm run scrape:venues`

---

**Last Updated**: February 2026
