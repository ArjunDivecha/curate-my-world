# Checks and Verification

This repository does not currently surface a single unified test command at the root for every layer, so verification should be matched to the area you changed.

## Root-level checks
From `package.json`:

- `npm run build` — frontend production build
- `npm run lint` — lint the frontend workspace
- `npm run dev` — frontend local dev server
- `npm start` — full-stack start script
- `npm run port:status` — inspect local port conflicts
- `npm run port:cleanup` / `npm run stop` — remove lingering processes

## Backend checks
From `.claude/CLAUDE.md` and `README.md`:

- `curl http://127.0.0.1:8765/api/health`
- `curl http://127.0.0.1:8765/api/health/deep`
- backend-specific tests if present under `curate-events-api/`
- targeted smoke tests for the route or client you changed

## When changing event flow
Verify these behaviors explicitly:
- categories still resolve correctly
- timezone handling still produces the correct day
- route ordering still exposes `/api/events/categories`
- the all-categories cache still reads from cache instead of live provider calls
- invalid listing pages still get filtered out

## When changing scraping or venue discovery
Verify:
- `data/venue-events-cache.json` is still valid JSON
- the scraper can load the venue registry
- the cache is not silently overwritten when malformed
- candidate artifacts match `data/venue-candidates/schema.json`

## When changing the preview proxy or moderation lists
Verify:
- private/internal URLs are still blocked by the preview route
- unknown domains still fall back to the "Open in New Tab" page
- list writes still honor production guards
- event-card actions still call the expected API endpoints

## Practical advice
- Prefer targeted checks over broad repo-wide searches.
- Re-read the source of truth before assuming old docs are correct.
- If a change affects caches, verify both file-backed and DB-backed modes when possible.
