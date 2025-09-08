Here’s a concise, implementation-ready brief you can 
⸻
Squirtle Backend Rewrite — Batch‑First Architecture Checklist

Objective: Rewrite the backend to a batch‑first design that builds a local dataset using Serper for enumeration and Exa for whitelist recall/detail rescue, while keeping the frontend unchanged and routing interactive queries to the local dataset only.

Status
- [x] Create feature branch `feat/backend-rewrite`

Prerequisites
- [ ] Configure API keys in `curate-events-api/.env` (and update `.env.example`): `SERPER_API_KEY`, `EXA_API_KEY` (others optional)
- [ ] Add/confirm provider toggles in config/env: `EXA_ENABLED`, `VENUE_EXA_ENABLED`, `SERPER_ENABLED`, `EXA_RESULTS_PER_QUERY`, `SERPER_RESULTS_PER_QUERY`
- [ ] Create `curate-events-api/data/whitelist.json` (see sample below) and decide seed venues/paths and per‑domain caps
- [ ] Decide persistence for local dataset (existing DB or lightweight store) and define event schema including `provenance` fields

Phase 1 — Orchestrator Extraction (dualSearch)
- [ ] Add `curate-events-api/src/lib/dualSearch.js` wrapping Serper and Exa with `Promise.allSettled`, env‑flag gating, and merge rules
- [ ] Normalize output shape for dedupe/search: `id,title,description,category,venue,location,startDate,endDate,eventUrl,ticketUrl,source,confidence,provenance[]`
- [ ] Refactor `curate-events-api/src/routes/events.js` to call `dualSearch` (remove direct provider orchestration)
- [ ] Update `experiments/speed-demon/speed-collector.js` to reuse `dualSearch` logic (avoid drift)

Phase 2 — Batch Pipeline
- [ ] Add `curate-events-api/src/batch/BatchRunner.js` implementing:
  - Enumerate with Serper over grid (city × category × time window, plus `site:` queries for whitelist)
  - Parse locally (single‑event vs listing pages; prefer JSON‑LD Event if present)
  - Exa whitelist passes: domain/path recall and text=true detail rescue under budget caps
  - Deduplicate, normalize, and persist to DB with `cluster_id` and `merged_from[]`
- [ ] Add route `curate-events-api/src/routes/batch.js` exposing `POST /batch/fetch` to trigger BatchRunner
- [ ] Register the route in `curate-events-api/server.js`

Phase 3 — Parsers & Dedupe
- [ ] Add `curate-events-api/src/lib/htmlParser.js` (JSON‑LD schema.org/Event first; fallback micro‑parsers for title/date/venue/ticketUrl)
- [ ] Add/align dedupe: `curate-events-api/src/lib/dedupe.js` (or unify with `src/utils/eventDeduplicator.js`) with URL normalization, canonical key `{title_or_performer}_{local_date}_{venue_norm}`, and near‑dupe clustering
- [ ] Add `curate-events-api/src/lib/whitelist.js` and `curate-events-api/data/whitelist.json` loader helpers (domain/path filters, per‑domain caps)

Phase 4 — Interactive Search (Local Dataset Only)
- [ ] Implement dataset searcher `curate-events-api/src/lib/searchDataset.js` (BM25 lexical + simple priors: venue/source/completeness)
- [ ] Point `curate-events-api/src/routes/events.js` to query local dataset only (no live provider calls)
- [ ] Keep frontend unchanged; verify UI queries hit the new dataset endpoint

Phase 5 — Telemetry & Budgets
- [ ] Track in batch results: `serper_calls`, `exa_calls`, `exa_text_calls`, `est_cost_usd`
- [ ] Enforce global and per‑domain caps; stop when budget reached; log per‑domain usage

Phase 6 — Tests & Docs
- [ ] Unit tests for `htmlParser` (JSON‑LD extraction + fallback) and `dedupe`
- [ ] Script a small batch smoke test across 2–3 whitelist venues/paths
- [ ] Update `curate-events-api/README.md` (two‑mode behavior, env flags, endpoints)

Acceptance Criteria
- [ ] Cost: ≥95% of new URLs from Serper + local parse; ≤5% require Exa `text=true` (tunable)
- [ ] Coverage: Whitelist domain/path pass yields unique events beyond Serper (tracked via `provenance`/`sources`)
- [ ] Latency: Interactive `/events` served from DB in <150ms p95 on dev data
- [ ] Simplicity: All provider fusion logic centralized in `dualSearch`; routes avoid provider calls except `/batch/fetch`
- [ ] DoD: Draft PR has small commits per phase; CI green; `/events` reads DB; `/batch/fetch` runs end‑to‑end with budgets

Key Env Flags (suggested)
- `EXA_ENABLED` (default 1), `VENUE_EXA_ENABLED` (default 0), `SERPER_ENABLED` (default 1)
- `EXA_RESULTS_PER_QUERY`, `SERPER_RESULTS_PER_QUERY` for tunable breadth
- `SERPER_API_KEY`, `EXA_API_KEY` required for this plan

Sample `data/whitelist.json`
{
  "includeDomains": [
    { "domain": "sfmoma.org", "paths": ["/events", "/exhibitions", "/calendar"], "max_exa_pages": 8 },
    { "domain": "berkeleyrep.org", "paths": ["/shows", "/season"], "max_exa_pages": 6 },
    { "domain": "sfsymphony.org", "paths": ["/concerts", "/calendar"], "max_exa_pages": 10 },
    { "domain": "thegreekberkeley.com", "paths": ["/events"], "max_exa_pages": 6 }
  ]
}

Implementation Notes
- Prefer `Promise.allSettled` in `dualSearch` and handle toggles defensively
- Use Exa domain/path filters for whitelist recall; use `text=true` only for detail rescue when local parse misses vital fields
- Persist provenance: which step/page produced the record (Serper, Exa recall, Exa text)
- Keep changes scoped to backend; do not touch frontend

Validation (dev)
- [ ] Run `/batch/fetch` for a small grid; verify dataset populated and telemetry recorded
- [ ] Query `/api/events` and confirm results are served from DB only
- [ ] Inspect logs for budget enforcement and per‑domain usage

Cutover Checklist
- [ ] Feature parity confirmed for interactive queries
- [ ] Observability in place for costs/coverage/latency
- [ ] Toggle old live‑provider paths off in routes

Tips for Working in This Repo
- Start small changes per phase; keep diffs surgical and commit frequently
- Validate against Google/schema.org Event guidelines for JSON‑LD parsing
- Do not add new providers; only Serper and Exa for this rewrite

Backend Rewrite Brief (for Codex CLI · GPT-5 High)

Objective

Rewrite backend to a batch-first pipeline: build and persist a local, deduped event dataset cheaply via Serper enumeration, use Exa sparingly to enrich whitelisted venues and rescue missing details, and have the interactive UI query only the local dataset (frontend largely unchanged). Serper is optimized for cheap, broad Google SERP capture; Exa provides domain/path-scoped recall and high-quality content retrieval when needed.  ￼ ￼

Repo anchors (keep FE intact; replace BE paths as below)
	•	experiments/speed-demon/speed-collector.js (existing parallel Exa/Serper logic)
	•	curate-events-api/src/routes/events.js (route-level Exa + Serper usage today)
	•	curate-events-api/src/clients/ExaClient.js, .../SerperClient.js (provider clients)

We will extract a single orchestrator that both routes and batch use, remove duplicate Promise orchestration, and introduce a batch runner.

⸻

Deliverables (files to add / modify)

Add
	•	curate-events-api/src/lib/dualSearch.(ts|js)
Orchestrates Exa+Serper with Promise.allSettled, applies rules/filters, merges & dedups (URL-level), returns normalized results + diagnostics.
	•	curate-events-api/src/lib/htmlParser.(ts|js)
Extracts schema.org/Event JSON-LD first; falls back to light HTML micro-parsers. Google requires single-event “leaf” pages and strongly recommends JSON-LD.  ￼
	•	curate-events-api/src/lib/dedupe.(ts|js)
URL normalization, canonical key {title_or_performer}_{local_date}_{venue_norm}, and near-duplicate clustering via shingles + MinHash/LSH (keeps the richest record, merges provenance).  ￼ ￼
	•	curate-events-api/src/lib/scoring.(ts|js)
BM25 for lexical relevance over title+desc+venue + simple priors (known venue, has tickets/price/image, near-term). BM25 is the standard default in search stacks and well-documented.  ￼
	•	curate-events-api/src/lib/whitelist.(ts|js)
Loads and enforces per-domain path rules & caps from data/whitelist.json.
	•	curate-events-api/src/batch/BatchRunner.(ts|js)
Batch pipeline (enumerate → parse → selective Exa → dedupe → persist), with budget caps and progress metrics.
	•	curate-events-api/src/routes/batch.(ts|js)
POST /batch/fetch to kick off BatchRunner and stream progress counters (serper_calls, exa_calls, exa_text_calls, est_cost_usd, totals).
	•	curate-events-api/data/whitelist.json
Example:

{
  "domains": [
    {"domain":"sfmoma.org","paths":["/events","/calendar"],"max_exa_pages":8},
    {"domain":"sfsymphony.org","paths":["/concerts","/calendar"],"max_exa_pages":10},
    {"domain":"thegreekberkeley.com","paths":["/events"],"max_exa_pages":6}
  ]
}



Change
	•	curate-events-api/src/routes/events.js:
Replace direct provider calls with DB-backed search over the persisted dataset. Optionally, add a “broaden” param that does a Serper refresh then combines results via RRF before returning (keep Exa off in interactive mode by default). RRF is a robust, tuning-free rank combiner now built into major search stacks.  ￼
	•	experiments/speed-demon/speed-collector.js:
Repoint internal orchestration to dualSearch to avoid drift.

⸻

Two Modes (exact behaviors)

1) Batch mode (on app launch or “Fetch Events”)

Goal: comprehensive dataset at minimal cost.
	1.	Enumerate with Serper
	•	Query grid: (city × category × timeWindow) + site:domain for whitelisted venues; fetch 15–20 URLs per query (cheap, fast).  ￼
	2.	Parse locally
	•	Prefer JSON-LD Event (schema.org) on single-event leaf pages; fallback micro-parsers for title/date/time/venue/price/image/tickets. Google’s Event docs emphasize single-event leaf URLs and JSON-LD.  ￼
	3.	Selective Exa (whitelist only)
	•	Domain/path recall: Exa search constrained to includeDomains + path filters (e.g., /events, /calendar) to catch venue posts SERPs miss; take top K per domain (small).
	•	Detail rescue: If a high-value page lacks date/venue after HTML/JSON-LD parse, call Exa contents retrieval (text=true) to get markdown body and re-parse. Both features are documented in Exa’s API.  ￼
	•	Enforce caps: BATCH_EXA_BUDGET_USD, BATCH_EXA_MAX_CALLS, per-domain max_exa_pages.
	4.	Deduplicate & persist
	•	Collapse URL-exact dupes + cluster near-dup titles/venues via MinHash/LSH; keep richest fields; record merged_from[] and cluster_id.  ￼ ￼

2) Interactive mode (in-app)
	•	Query local dataset only (fast).
	•	Rank with BM25 + priors; optional MMR for diversity if needed.
	•	If user explicitly taps “broaden,” run a Serper refresh only and combine with local results via RRF (no Exa here by default).  ￼

⸻

API Surface (unchanged for FE, plus batch endpoint)
	•	POST /batch/fetch → starts BatchRunner, returns progress & final counts.
	•	GET /events → local dataset search: q, category, city, dateRange, price, venueIds, hasTickets, page, pageSize.
	•	GET /events/:id → detail (from stored fields).

FE change: wire the search bar to GET /events (dataset), not live provider calls.

⸻

Env & knobs
	•	Keep: EXA_ENABLED, SERPER_ENABLED, VENUE_EXA_ENABLED, EXA_RESULTS_PER_QUERY (3–5), SERPER_RESULTS_PER_QUERY (15–20)
	•	New (batch):
BATCH_TIME_WINDOW_DAYS=30, WHITELIST_EXA_ENABLED=true,
WHITELIST_EXA_TEXT=false (flip true only for failed parses),
BATCH_EXA_BUDGET_USD, BATCH_EXA_MAX_CALLS, PER_DOMAIN_EXA_CAP
	•	Data: curate-events-api/data/whitelist.json

⸻

Persistence model (fields to add)
	•	sources: ["serper"] or ["serper","exa"]
	•	content_source: "jsonld" | "html" | "exa_text"
	•	extraction_confidence: 0–1
	•	cluster_id, merged_from[]
	•	fetch_meta: {serper_calls, exa_calls, exa_text_calls, est_cost_usd}

⸻

Merge & ranking specifics
	•	Dedup: normalize URLs; canonical key; then MinHash/LSH on title/venue shingles for fuzzy collapse.  ￼ ￼
	•	Interactive ranking: BM25 over title+desc+venue plus priors; when fusing local+fresh (broaden), use RRF (tuning-free, widely adopted).  ￼

⸻

Acceptance criteria
	•	Cost: ≥95% of new URLs from Serper + HTML/JSON-LD, ≤5% require Exa text=true (tunable).  ￼ ￼
	•	Coverage: For whitelisted venues, Exa (domain/path) adds unique events beyond Serper (tracked via sources).  ￼
	•	Latency: Interactive /events (DB-backed) p95 < 150 ms on dev data.
	•	Simplicity: All provider fusion centralized in dualSearch; routes no longer call providers directly (except /batch/fetch).

⸻

Execution plan (small commits Codex can follow)
	1.	Extract orchestrator: create src/lib/dualSearch using existing clients; move rules & merge logic from routes/speed-collector; return normalized items + diagnostics.
	2.	Batch runner: add BatchRunner (Serper enumerate → parse → selective Exa → dedupe → persist); add routes/batch → POST /batch/fetch.
	3.	Parsers & dedupe: add htmlParser (JSON-LD first per Google), dedupe (URL normalize + MinHash/LSH), data/whitelist.json + lib/whitelist.  ￼
	4.	Interactive routes: update routes/events to query DB; add BM25+priors; optional RRF fusion on broaden=true.  ￼
	5.	Metrics & budgets: log {serper_calls, exa_calls, exa_text_calls, est_cost_usd}; enforce caps; emit batch summary.
	6.	Docs & smoke tests: README note on two modes; add a small batch test across 2–3 whitelist venues.

⸻

Provider-specific notes (what to call)
	•	Serper: use general queries plus site:domain for whitelisted venues; it’s fast & very cheap (listed pricing: ~$0.30 / 1,000 queries).  ￼
	•	Exa:
	•	Search with includeDomains and path constraints to target /events, /calendar, etc.; low K per domain.
	•	Contents retrieval (text=true) only for pages where JSON-LD/HTML parse failed; Exa returns cleaned markdown body.  ￼

⸻

Prompting notes for Codex CLI (GPT-5 High)

Use these verbatim guardrails when you kick off the agent. They reflect OpenAI’s official prompt-engineering guidance for modern models and codegen tasks.

System / meta-instructions (top of task):
	•	State role, scope, and constraints explicitly (what to change, what not to touch). Provide file paths and acceptance tests up front. OpenAI’s guides emphasize clear, specific instructions and outputs.  ￼ ￼
	•	Plan, then act: ask the model to propose a short step plan, then implement in small, testable commits, reporting changed files after each step. Cookbook guidance for 4.1/5 highlights structured prompts and incremental execution.  ￼
	•	Ground in references: paste the BE brief (above) and cite external specs for ambiguity (Event JSON-LD, Serper, Exa endpoints).  ￼ ￼ ￼
	•	No secrets: read keys from existing .env; don’t print them.

Execution behaviors to require:
	•	File-scoped edits only; show a diff summary after each phase.
	•	Validate: run lints/tests; if a parser fails to extract startDate/venue, fallback to Exa text=true for whitelisted domains only.  ￼
	•	Don’t over-call Exa: enforce BATCH_EXA_BUDGET_USD, per-domain caps, and stop when budget hit.
	•	Ranking: implement BM25 and optional RRF for fusion (when “broaden” is requested). Cite formula or vendor docs if needed.  ￼

One-shot kickoff block (paste to Codex CLI):

You are implementing a backend rewrite in curate-events-api to a batch-first architecture.
Do:
• Create src/lib/dualSearch, src/batch/BatchRunner, src/lib/htmlParser, src/lib/dedupe, src/lib/scoring, src/lib/whitelist, and src/routes/batch.
• Route /events to the local dataset; wire “broaden” to Serper refresh + RRF fusion (no Exa).
• Batch: Serper for enumeration (15–20 results per query), Exa only for whitelist domain/path recall and text=true detail rescue (budget-gated).
• Keep existing env flags; add new batch/whitelist caps; use .env.
• Work in small commits; after each phase print changed files and run checks.
Don’t: modify frontend, add providers, or exceed Exa budget.
Acceptance: cost/coverage/latency and “Definition of Done” exactly as in the brief.

⸻

Reference links (for Codex to consult while implementing)
	•	Serper: positioning & pricing (fast & cheap Google SERP)  ￼
	•	Exa: search API; contents retrieval text=true; OpenAPI spec; SDK notes (text=True)  ￼ ￼
	•	Google / schema.org Event: leaf pages, JSON-LD, general structured-data rules & updates  ￼
	•	Ranking & fusion: RRF docs; hybrid search with RRF; BM25 explainer (Elastic)  ￼
	•	Near-duplicate detection: LSH/MinHash over shingles (overview & practical guides)  ￼ ￼
	•	OpenAI prompting: official guides + Cookbook (GPT-4.1 & general best practices)  ￼ ￼ ￼
