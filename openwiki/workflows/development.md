# Development Workflow

This repository is split across a frontend app, a backend API package, and a collection of operational scripts. The safest way to work is to identify which layer you are touching and run the matching checks.

## Local start commands
From `package.json` and `CLAUDE.md`:

- `npm start` or `./scripts/start-all.sh` — start both services
- `npm run dev` — frontend dev server on port 8766
- `cd curate-events-api && npm run dev` — backend dev server on port 8765
- `npm run start:frontend`
- `npm run start:backend`
- `npm run stop`
- `npm run port:status`
- `npm run port:cleanup`

The root scripts and `PORT_MANAGEMENT.md` establish the stable ports used by the repo.

## Recommended change loops
### Frontend changes
Usually involve:
- `src/components/*`
- `src/hooks/useDashboardLogic.ts`
- `src/lib/*`
- `src/utils/*`

Useful checks:
- `npm run build`
- `npm run lint`
- browser smoke test through the dashboard

### Backend changes
Usually involve:
- `curate-events-api/src/routes/*`
- `curate-events-api/src/clients/*`
- `curate-events-api/src/utils/*`
- `curate-events-api/scripts/scrape-venues.js`

Useful checks:
- backend health endpoint
- any existing backend tests under `curate-events-api/`
- a targeted scrape or cache-load smoke test when touching scraper behavior

### Data and workflow changes
Usually involve:
- `data/venue-registry.json`
- `data/venue-events-cache.json`
- `data/venue-candidates/*`
- `docs/svda/*`

Useful checks:
- JSON validation
- schema validation when candidate artifacts change
- re-reading diffs before considering a registry update safe

## Common gotchas
- The frontend uses the backend API as the source of truth for event data, but it also keeps local cache state for responsiveness.
- The backend is cache-first; do not assume live provider calls happen on each request.
- Port conflicts are common if you launch services manually without the port manager.
- Some root docs describe live operational reality and are more current than older planning docs.

## Where to start when unsure
1. Read `README.md` and `.claude/CLAUDE.md` (verify `.claude/CLAUDE.md` details against source — some are stale).
2. Check `src/hooks/useDashboardLogic.ts` for frontend behavior.
3. Check `curate-events-api/src/routes/events.js` for backend flow.
4. Check `PORT_MANAGEMENT.md` before running the stack locally.
5. Check `ENVIRONMENT.md` before changing env vars.
