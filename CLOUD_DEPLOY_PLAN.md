# Cloud Deploy Transition Plan

## Objective
Deliver four phases in sequence without breaking current functionality:

1. Establish foundation gates (contracts, environments, persistence) for safe migration.
2. Deploy to cloud so the app works anywhere from browser and app clients.
3. Build and ship a native iOS app using Xcode.
4. Finalize mobile-web polish on top of cloud production behavior.

## Non-Negotiables
- No functional regressions in current event collection and category behavior.
- Keep existing endpoints working during transition.
- Validate each phase with explicit exit criteria before starting the next.

## Current Baseline
- Frontend: Vite + React app (local dev on port 8766).
- Backend: `curate-events-api` Node/Express service (local dev on port 8765).
- Core flow: Ticketmaster + venue scraper + validator pipeline.
- Local-file dependencies exist for cache/list data and need cloud-safe handling.

## Phase 0: Foundation Gate (Required Before Cloud)

### Goal
Create stable contracts and deployment prerequisites so cloud and iOS work do not require rework.

### Workstreams
1. API contract definition
- Lock a stable event response schema (required fields, nullability, date format, category enum).
- Publish an API contract (`OpenAPI` or equivalent) for web and iOS integration.

2. API response baseline hardening
- Add/standardize pagination and limits for list endpoints.
- Ensure consistent lightweight card payload for event lists.
- Keep detailed payload endpoint for drill-down views.
- Add clear error envelope and retry-safe status codes.

3. Environment and config matrix
- Define `dev`, `staging`, `prod` base URLs and CORS policies.
- Standardize frontend/backend env variable names and ownership.

4. Persistence migration design
- Identify mutable runtime data currently on local filesystem.
- Define cloud-safe storage model (Railway Postgres and/or object storage).
- Create migration and rollback approach for runtime state.

5. Validation gate
- Confirm current desktop behavior against contract and baseline smoke tests.

### Exit Criteria (Must Pass)
- API schema is versioned/documented and stable.
- Env matrix is finalized for all tiers.
- Persistence approach and migration plan are approved.
- Baseline smoke checks pass before deployment work begins.

## Phase 1: Cloud Deployment (Railway + Vercel)

### Goal
Run the app globally with production URLs usable from any Mac browser and app clients.

### Target Architecture
- `Vercel`: frontend hosting (production + preview environments).
- `Railway`: backend API hosting.
- Externalized persistent data store for runtime state (avoid ephemeral filesystem reliance).

### Workstreams
1. Data persistence hardening
- Move mutable runtime data (blacklists, cache metadata, dynamic lists) off local files.
- Use durable storage (Railway Postgres or managed DB/object store) for production state.
- Keep static registries in version control only if truly static.

2. Railway backend deployment
- Configure start command, health check, and restart policy.
- Set required secrets (`TICKETMASTER_CONSUMER_KEY`, `ANTHROPIC_API_KEY`, etc.).
- Verify `/api/health` and critical event endpoints post-deploy.

3. Vercel frontend deployment
- Configure build command/output (`npm run build`, `dist`).
- Set `VITE_API_BASE_URL` to Railway production URL.
- Validate SPA routing and API connectivity from deployed frontend.

4. Observability and operations
- Centralize logs and basic alerting for API health and failure rates.
- Define rollback procedure for backend and frontend independently.
- Add simple uptime checks on health endpoints.

### Phase 1 Deliverables
- Production URLs for frontend and backend.
- Deployment runbook (setup, env vars, health checks, rollback).
- Post-deploy verification checklist.

### Exit Criteria (Must Pass)
- Browser users can use the full app from public URL.
- Runtime state survives deploy/restart events.
- Rollback procedure is tested and documented.

## Phase 2: Mobile-Web Hardening on Cloud

### Goal
Finalize iPhone-friendly web behavior against real cloud endpoints and real-world network conditions.

### Workstreams
1. Frontend mobile UX pass
- Ensure responsive layout for iPhone widths (no horizontal overflow).
- Respect iOS safe areas (`env(safe-area-inset-*)`) and fixed header/footer behavior.
- Enforce touch target minimums and readable typography on small screens.
- Optimize heavy views (calendar/cards) for mobile scroll performance.

2. Network and reliability tuning
- Improve loading/empty/error/offline states for slow mobile networks.
- Enable response compression and caching headers where safe.
- Reduce initial payload and avoid unnecessary re-fetches.

3. QA and validation
- Test matrix: iPhone SE, iPhone 14/15 class widths, Safari + WKWebView.
- Run network throttling tests (slow 4G/3G) and confirm graceful degradation.
- Verify no behavior regression on desktop web.

### Phase 2 Deliverables
- Mobile UI checklist with before/after screenshots.
- Test report for iOS form factors and network conditions against cloud URLs.

### Exit Criteria (Must Pass)
- All primary screens are usable on iOS phone widths with no layout break.
- Event list/detail actions work reliably on touch devices.
- Existing desktop behavior remains intact.

## Phase 3: Native iOS App (Xcode)

### Goal
Build a production-grade iOS app in Xcode that consumes the deployed cloud API and works anywhere.

### Workstreams
1. Xcode project and app architecture
- Create iOS app project (`SwiftUI`) with clear module boundaries.
- Define minimum iOS version and device targets.
- Configure app bundle IDs for dev/staging/prod.

2. API integration and data contracts
- Implement typed API client using the Phase 0 contract.
- Add environment-based base URL switching (dev/staging/prod).
- Ensure strict date parsing, category mapping, and resilient error handling.

3. Core feature parity with web
- Event feed, category filtering, search, and event details.
- Open event links in in-app browser/Safari.
- Support blacklist actions if required in mobile UX.

4. Mobile reliability and UX quality
- Loading, empty, retry, and offline states.
- Background/foreground app lifecycle handling.
- Performance pass on list rendering and scrolling.

5. Security and configuration
- No secret API keys embedded in app binary.
- Use backend-only secret handling; app uses public API endpoints only.
- Harden ATS/network settings and transport rules.

6. Release and operations
- Apple signing, provisioning profiles, and TestFlight pipeline.
- Add crash/error monitoring (for example: Sentry/Firebase Crashlytics).
- Define versioning and release rollback process.

7. Validation
- Test on real iPhones and simulator across small and large screen sizes.
- Validate on non-local networks to confirm no localhost dependencies.
- Confirm cloud endpoints and app behavior after backend/frontend redeploy.

### Phase 3 Deliverables
- Xcode iOS app project with documented setup.
- TestFlight build for stakeholder testing.
- Mobile runbook (build, signing, release, rollback).

### Exit Criteria (Must Pass)
- App is installable via TestFlight and works on real iPhones.
- App can fetch and render production data from cloud endpoints.
- Core user journeys match agreed functionality from web.
- No dependency on local machine services.

## Suggested Sequence and Milestones
1. Phase 0 foundation gate (contract + env matrix + persistence plan).
2. Phase 1 infrastructure and persistence implementation.
3. Phase 1 staging deploy and validation.
4. Phase 1 production cutover and monitoring.
5. Phase 2 cloud-based mobile-web hardening.
6. Phase 2 mobile QA sign-off.
7. Phase 3 Xcode app implementation.
8. Phase 3 TestFlight rollout and validation.
9. Phase 3 production app release.

## Risk Register (Top Items)
1. Local-file runtime state breaks in cloud.
- Mitigation: externalize mutable data before production cutover.

2. Mobile UI regressions during responsive changes.
- Mitigation: run iOS-width visual checklist against deployed cloud environment.

3. CORS and environment mismatch between Vercel and Railway.
- Mitigation: explicit env matrix and staged smoke tests before prod.

4. API latency/cost spikes from provider calls.
- Mitigation: caching, request limits, and provider-level telemetry dashboards.

5. iOS release pipeline delays (signing/provisioning/review).
- Mitigation: set up Apple Developer assets and TestFlight early in Phase 3.

## Definition of Done
- Phase 0 through Phase 3 complete with exit criteria met.
- No regression in core event discovery flow.
- Team can deploy, monitor, rollback, and ship iOS releases confidently.
