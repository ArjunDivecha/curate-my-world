# Hybrid Event Finder Plan (Fast + Current Pipeline)

Status: Proposal only (no code changes made)

Owner: Arjun / Codex

Date: 2025-09-07

---

## Goals

- Maximize recall of high‑quality, local events while keeping precision high.
- Combine strengths of the “fast” finder (domain/venue coverage, speed) with the current pipeline (normalization, dedup, categorization, UI integration).
- Keep costs and latency predictable; prefer API calls with bounded timeouts and pagination.
- Provide observability: clear per‑source/venue coverage, deltas vs prior runs, and easy knobs to tune.

---

## Speed‑First (Turbo Mode) Revision

Assumptions (updated):
- Needs to feel instantaneous; we can spend on parallelism and premium APIs.
- Over‑fetch + dedup is acceptable if it buys latency and coverage.
- Return partial results immediately; refine asynchronously.

SLOs:
- TTFB initial results: ≤ 500 ms (warm cache) or ≤ 1.5 s (cold miss).
- P50 per category: ≤ 5 s. P95: ≤ 10 s.
- All‑categories: first screenful in ≤ 2 s; full in ≤ 20 s.

Key shifts:
- Fast‑first: default to the “fast” method with a large curated venue whitelist and high concurrency.
- Always‑on background indexer to keep a hot cache (30–60 days horizon), refreshed hourly.
- On‑demand turbo collectors run in parallel to backfill misses and refresh cache.
- LLM field‑repair and summaries are non‑blocking and applied post‑return.

## Context Snapshot

- Current backend sources: Perplexity (optional), Apyflux (optional), PredictHQ (optional), Exa (fast), Serper, Ticketmaster.
- Current dedup: `curate-events-api/src/utils/eventDeduplicator.js` (priority by source, fuzzy title/venue/date matching).
- Current Exa client: `curate-events-api/src/clients/ExaClient.js` uses type: "fast" queries.
- “Fast” finder: produces CSV seeded by a whitelist of venues/organizers and targeted queries to avoid missing key domains.
- Initial comparison shows “fast” catches venue/organizer domains (e.g., Greek Theatre, Stanford events) where current feed is light; current feed is strong on Eventbrite/aggregators.

## Strategy (Venue‑First Hybrid)

Adopt a tiered collector, in this order:

1) Venue/Organizer Pass (Whitelist) — Turbo
- Crawl‑less API search via Exa for a curated list of domains and organizers. Ensures we cover high‑signal venues regardless of aggregator presence.
- Query pattern examples per venue:
  - `site:{domain} (events|calendar|what's on|tickets) {city}`
  - Category‑specific boosters: music/theatre/comedy/art/etc.
- Maintain the whitelist in a checked‑in file (JSON/YAML), with metadata: category hints, location bias, priority score.
  - Turbo: pre‑compute top 200–500 venues hourly; request path hits cache first.

2) Query‑Based Fast Pass — High Concurrency
- For each category/location: N Exa “fast” queries targeting official event pages and registration sites with category keywords and date windows.
- Prefer domains historically yielding valid events (Eventbrite, Meetup, Luma, venue sites). Penalize known spammy aggregators.
  - Turbo knobs: raise `numResults`, widen query variants, run with a worker pool (e.g., 32–64 concurrent calls, per‑provider QPS caps).

3) Aggregator/Directory Pass (Optional)
- Keep Serper/other directories as recall backstops, but apply strong aggregator penalties in ranking.

4) LLM Extraction/Recovery (Optional, non‑blocking)
- When category results are sparse (< threshold), enable a Perplexity recovery pass for that category.
- Use LLM to repair fields (date/venue) or create summaries after initial return; only admit items that pass validation (title + date + venue).

Streaming UX:
- Expose SSE endpoint to stream cache hits immediately, then turbo‑collector results as they arrive.
- Show “x of y” progress and per‑source/venue attribution while streaming.

## Scoring & Ranking

Introduce an explicit event score to unify results before dedup:

- Domain trust: whitelist venue (+0.30), known organizer (+0.20), aggregator (−0.20).
- Structured fields present: title (+0.10), startDate (+0.10), venue name (+0.10), external URL (+0.05).
- Recency: events within target window (+0.05); stale/undated (−0.10).
- Category match: content/URL matches requested category (+0.10), mismatched (−0.10).
- Bonus: tickets/registration URL present (+0.10).

Turbo tweak:
- Add a “latency bonus” for sources that consistently deliver unique results fast; affects streaming order only (not final ranking).

Computed score guides both pre‑dedup filtering and post‑dedup ordering.

## Dedup Improvements

- Canonical key: `normalize(title) + normalize(venue) + date_floor_hour`.
- URL canonicalization: domain + path (strip trailing slashes, tracking params); treat `www.eventbrite.*` instances as equal.
- Priority by source: venue/organizer > ticketing (TM/TodayTix/Lu.ma) > Eventbrite/Meetup > generic aggregators > LLM.
- Merge fields when selecting best event (keep highest confidence + richest metadata).

Turbo tweak:
- Prefer cached canonical when duplicate contention occurs in a single run to avoid UI flicker.

## Location & Category Precision

- LocationFilter remains, but add city/region allowlist per run (e.g., Bay Area cities) with radius km fallback.
- For venue/organizer pass, assume venue is in declared city unless page indicates otherwise.
- Category from source signal: use folder path/URL hints (e.g., `/concerts/`, `/theatre/`), plus content heuristics.

Turbo tweak:
- Allow “soft” category at first return (fast heuristics), upgrade to “hard” category after LLM/repair step writes back to cache.

## Observability & QA

- Coverage dashboard (JSON artifacts):
  - Per‑domain counts, unique survivors, duplicates removed.
  - “Fast‑only” vs “Current‑only” deltas per domain.
  - Top missing domains this week.
- Nightly compare job writes into `outputs/coverage_*.(json|csv)`.
- Add `GET /api/debug/coverage` to fetch latest stats.

Turbo additions:
- Track cache hit ratio and cache‑age histograms; per‑provider latency distributions.
- Instrument “first byte” and “first 20 events” timings per query.

## Data Files & Config

- `config/venues_whitelist.json` (new):
  ```json
  [
    { "domain": "thegreekberkeley.com", "name": "Greek Theatre", "categories": ["music"], "priority": 0.9 },
    { "domain": "events.stanford.edu", "name": "Stanford Events", "categories": ["talks","science"], "priority": 0.8 }
  ]
  ```
- Feature toggles in `src/utils/config.js`:
  - `sources.useHybrid`: default true
  - `hybrid.enableVenuePass`: true
  - `hybrid.enableFastPass`: true
  - `hybrid.enableAggregators`: false (opt‑in)
  - `hybrid.enableLLMRecovery`: false (default)
  - `hybrid.turbo`: true (enables high concurrency + cache‑first + streaming)
  - `hybrid.concurrency`: 64 (global), with per‑provider caps (e.g., Exa=32, Serper=8)
  - `hybrid.cache`: { ttlMinutes: 10, prewarm: true, venuesTopN: 500 }

## API Surface (Proposed)

- `GET /api/events/:category/hybrid` → uses hybrid tiers with dedup + scoring.
- `GET /api/events/all-categories` gains `mode=hybrid|fast|legacy` and `include=domains,coverage` flags.
- `POST /api/admin/venues` (optional) to update whitelist at runtime (dev only).
 - Streaming (new): `GET /api/events/:category/hybrid/stream` (SSE) for incremental delivery.

## Implementation Plan (Phased)

### Phase 0 – Metrics & Ground Truth (1–2 days)

- Add comparison script(s) (already started):
  - Extend `scripts/compare-fast-vs-current.js` to write detailed per‑domain stats and exact lists.
- Freeze a baseline dataset (current + fast) for SF.
- Define success criteria: +X% unique venue domain coverage, ≤Y% aggregator share, ≤Z% dup rate.

### Phase 1 – Venue/Organizer Pass (3–4 days)

- New module: `curate-events-api/src/collectors/VenueCollector.js`
  - Reads `config/venues_whitelist.json`.
  - For each domain, issues 1–3 Exa fast queries (category‑aware) with timeouts & concurrency caps.
  - Transforms results via a shared normalizer (see below) and emits events with `source='venue_fast'` and `domain` field.
- Normalizer: `src/utils/normalizers/exaToEvent.js`
  - Reuse logic from `ExaClient.transformEvent`, add better venue/location extraction and date parsing.
- Add tier scoring signals for domain trust.

### Phase 2 – Query‑Based Fast Pass (2–3 days)

- Extend `ExaClient` with category‑tuned queries:
  - Allow injection of a keyword bundle per category.
  - Add lightweight domain boosting list (Eventbrite, Meetup, Lu.ma, SFJAZZ, etc.).
- Emit events `source='exa_fast'` with `score` fields populated.

### Phase 3 – Aggregator Pass (Optional, 1–2 days)

- Keep Serper but mark as low trust.
- Add configurable penalties in scoring.
- Enable only if `hybrid.enableAggregators=true`.

### Phase 4 – LLM Extraction/Recovery (Optional, 2–3 days)

- Hook Perplexity as a fallback when category results are sparse.
- Validate fields (title/date/venue) before admitting.
- Emit `source='perplexity_api'` with low priority.

### Phase 5 – Dedup & Scoring Integration (2–3 days)

- Update `eventDeduplicator` to:
  - Use canonical URL and new score when selecting winners.
  - Add source priority order (venue_fast > ticketing > exa_fast > aggregator > llm).
  - Export `dedupStats.sourceBreakdown` including new sources.

### Phase 6 – API & Flags (1–2 days)

- Add `/:category/hybrid` route and enhance `all-categories` with `mode` & `include` flags.
- Wire toggles in `config.sources` & `config.hybrid`.

### Phase 7 – Observability (2–3 days)

- Coverage artifacts under `outputs/coverage_*.json` with:
  - per‑domain counts, unique survivors, dup removed
  - new/missing domains vs last run
- Add lightweight route `GET /api/debug/coverage`.

### Phase 8 – Rollout & Tuning (ongoing)

- Run A/B across 1–2 weeks; track KPIs:
  - Venue domain coverage; aggregator share; unique survivals per category; time to results.
- Iterate whitelist; expand via discovered domains (auto‑suggest from frequent fast‑only domains).

## Risks & Mitigations

- Rate limits / API quotas → Concurrency caps, exponential backoff, short timeouts.
- Duplicate noise from aggregators → Strong penalties + dedup precedence for venue/organizer items.
- Location leakage (nearby cities) → Tighten `LocationFilter`; optionally geocode venue addresses when present.
- Parsing fragility → Centralized normalizer with unit tests and representative samples.
 - Cost blow‑ups → Budget guardrails: per‑run token/API spend caps, circuit breakers that fall back to cached results.

## Test Plan

- Unit tests: normalizer (URL/title/date/venue extraction), dedup selection logic.
- Integration: collector produces normalized events across a fixture of domains.
- E2E: run hybrid on SF; compare to baseline; verify increases in venue coverage and stable dup rate.
 - Load tests: verify P50/P95 latency under parallel users; ensure streaming TTFB under 1.5 s on cold cache.

## Success Criteria

- +20–30% increase in venue/organizer domain coverage compared to baseline.
- Aggregator share ≤ 25% of survivors.
- Dup rate stable or lower vs current.
- p95 per‑category latency within target (e.g., ≤ 10s per category at configured limits).
 - TTFB for hybrid/stream endpoints ≤ 1.5 s cold; ≤ 500 ms warm.

## Rollback

- Keep `mode=legacy` path active to immediately revert to existing pipeline.
- Feature flags in config allow selective disabling of tiers.

---

## Implementation Notes (Where to Change Later)

- New files:
  - `config/venues_whitelist.json`
  - `curate-events-api/src/collectors/VenueCollector.js`
  - `curate-events-api/src/utils/normalizers/exaToEvent.js`
- Modified:
  - `curate-events-api/src/clients/ExaClient.js` (tuned queries, scoring fields)
  - `curate-events-api/src/utils/eventDeduplicator.js` (priority + canonical URL)
  - `curate-events-api/src/routes/events.js` (hybrid endpoints + flags)
  - `curate-events-api/src/utils/config.js` (hybrid toggles)

No code changes have been applied with this document.
