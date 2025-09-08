Implementation PRD for Codex CLI (GPT-5 High) — Backend Rewrite to Batch-First Dataset with Serper Enumeration & Exa Whitelist Enrichment

Give this document to Codex CLI (GPT-5 High) as the task brief. It is designed around your current repo layout and the two-mode architecture we agreed on. Prompting/agent operating tips included at the end (taken from OpenAI’s own guidance).

⸻

0) References (for the agent & reviewers)
	•	Codex CLI overview & repo (local agent that can read/modify/run code): developers page & GitHub.  ￼ ￼
	•	Prompting GPT-5 / codegen best practices (OpenAI Cookbook & docs).  ￼ ￼
	•	Serper (Google SERP API) positioning & pricing (fast, very low cost).  ￼
	•	Exa API: contents retrieval (text=true) and domain/path filters (for venue sections).  ￼
	•	Event data extraction: schema.org/Event & Google event structured-data guidelines (leaf event pages, required fields).  ￼ ￼

⸻

1) Objective

Rewrite the backend only to a batch-first design:
	•	Batch mode (on app launch or “Fetch Events”): build a comprehensive local dataset using Serper for enumeration and Exa only for whitelisted domains (venue recall & detail rescue).
	•	Interactive mode (user filters/searches): query only the local dataset; no provider calls by default.
	•	Keep the frontend as-is, except point the search UI at the backend’s local dataset query.

This keeps provider cost low (Serper as workhorse) and uses Exa surgically for venues/paths and content cleanup.  ￼ ￼

⸻

2) Scope & Constraints
	•	Do not alter the frontend beyond swapping the search source to the local dataset endpoint.
	•	Providers in scope: Serper and Exa only (ignore others).
	•	Preserve existing env toggles where present (EXA_ENABLED, SERPER_ENABLED, VENUE_EXA_ENABLED, EXA_RESULTS_PER_QUERY, SERPER_RESULTS_PER_QUERY), and add new ones listed below.
	•	No code output in this PRD (implementation happens when Codex executes).

⸻

3) High-Level Design (repo-aligned)

Create a small, explicit backend surface with one orchestrator, one batch runner, one dataset searcher, and light HTML/JSON-LD parsers.

curate-events-api/
  src/
    lib/
      dualSearch.(ts|js)       # shared orchestrator: Serper/Exa calls, rules, merge, dedup-ready
      htmlParser.(ts|js)       # JSON-LD (schema.org/Event) + HTML micro-parsers
      dedupe.(ts|js)           # URL normalize + near-dupe cluster (shingles/MinHash-style)
      scoring.(ts|js)          # BM25 lexical + simple priors (venue/source/completeness)
      whitelist.(ts|js)        # loads data/whitelist.json; helpers for domain/path caps
    batch/
      BatchRunner.(ts|js)      # batch pipeline (enumerate→parse→selective Exa→dedupe→persist)
    routes/
      events.(ts|js)           # interactive: query local dataset only (search/filter/paginate)
      batch.(ts|js)            # POST /batch/fetch to kick off BatchRunner
    clients/
      ExaClient.(ts|js)        # keep; add includeDomains/path + text=true options passthrough
      SerperClient.(ts|js)     # keep; support site:domain queries & result count param
  data/
    whitelist.json             # venue domains & allowed paths (+ per-domain Exa caps)

	•	dualSearch replaces parallel provider code currently duplicated in:
experiments/speed-demon/speed-collector.js and curate-events-api/src/routes/events.js.
Both should call dualSearch to avoid drift.

⸻

4) Two Modes — Behavior

4.1 Batch Mode (on launch or “Fetch Events”)

Goal: Build/refresh the local dataset cheaply; persist normalized events with provenance.
	1.	Enumerate with Serper (cheap breadth):
	•	Query grid over (city × category × time window) and site:domain for whitelist.
	•	Pull 15–20 URLs per query (SERPER_RESULTS_PER_QUERY). Serper returns Google SERPs quickly at very low cost.  ￼
	2.	Parse locally:
	•	For single-event pages: extract name/title, startDate, endDate, startTime, venue, address, image, ticketUrl, price, prefer JSON-LD schema.org/Event if present (leaf event pages per Google).  ￼ ￼
	•	For listing pages: collect child event links (cap per page).
	3.	Exa (whitelist-only) for recall & detail rescue (budget-gated):
	•	Domain/path recall: includeDomains with path filters (e.g., /events, /calendar) to surface venue posts SERPs might bury; fetch only top K per domain.  ￼
	•	Detail rescue: if vital fields (date/venue) missing after our parse, call contents retrieval (text=true) to get clean markdown text and re-parse; whitelist domains only.  ￼
	4.	Deduplicate & normalize:
	•	Exact: normalized URL; canonical key {title_or_performer}_{local_date}_{venue_norm}.
	•	Near-dupe cluster (shingles/MinHash-style) to fold fuzzy variants; keep richest record and merge provenance (sources, content_source).
	•	Persist to DB with cluster_id and merged_from[].

Why this mix works: Serper’s cheap speed for URL discovery; Exa’s precision tooling when we target specific venue sections and extract clean content from stubborn pages.  ￼ ￼

⸻

4.2 Interactive Mode (in-app)
	•	All search/filters hit local dataset only (no provider calls).
	•	Ranking: BM25 over title+desc+venue, plus simple priors (known venue, has tickets/price/image, near-term date). Use BM25 per OpenAI prompting guide’s clarity emphasis—BM25 is standard, fast lexical relevance.  ￼
	•	Optional “broaden” action: do Serper refresh only, fuse with local via lightweight RRF and re-rank; keep Exa off unless explicitly asked to enrich details.

⸻

5) Provider Policies (enforced in dualSearch + BatchRunner)
	•	Serper default: enabled everywhere for enumeration; higher RESULTS_PER_QUERY.  ￼
	•	Exa selective:
	•	Enabled only for whitelist domains/paths (recall) and detail rescue (text=true) when parsers fail; lower RESULTS_PER_QUERY.  ￼
	•	Apply global and per-domain caps & $ budget; short-circuit when budget reached.

⸻

6) Data Model Additions

Add fields to event rows:
	•	sources (set): e.g., ["serper"] or ["serper","exa"]
	•	content_source: "html" | "jsonld" | "exa_text"
	•	extraction_confidence: float 0–1 (parser-assigned)
	•	cluster_id: stable ID for a deduped group
	•	merged_from: array of contributing URLs
	•	fetch_meta: {serper_calls, exa_calls, exa_text_calls, est_cost_usd}

Use schema.org/Event & Google guidance to validate the minimum viable fields.  ￼ ￼

⸻

7) API Surface (unchanged for FE, new batch endpoint)
	•	POST /batch/fetch → triggers BatchRunner; returns progress {counts, serper_calls, exa_calls, est_cost_usd}.
	•	GET /events → search local dataset with q, category, city, dateRange, price, venueIds, hasTickets, page, pageSize.
	•	GET /events/:id → detailed view from persisted fields.

Frontend: point existing search UI to GET /events. No other UI changes.

⸻

8) Configuration (env + data)
	•	Existing (keep): EXA_ENABLED, SERPER_ENABLED, VENUE_EXA_ENABLED, EXA_RESULTS_PER_QUERY (e.g., 3–5), SERPER_RESULTS_PER_QUERY (e.g., 15–20).
	•	New (batch focus):
	•	BATCH_TIME_WINDOW_DAYS=30
	•	WHITELIST_EXA_ENABLED=true
	•	WHITELIST_EXA_TEXT=false (flip to true only for failed parses)  ￼
	•	BATCH_EXA_BUDGET_USD, BATCH_EXA_MAX_CALLS, PER_DOMAIN_EXA_CAP
	•	Whitelist config file: curate-events-api/data/whitelist.json

{
  "domains": [
    {"domain": "sfmoma.org", "paths": ["/events", "/calendar"], "max_exa_pages": 8},
    {"domain": "sfsymphony.org", "paths": ["/concerts", "/calendar"], "max_exa_pages": 10},
    {"domain": "thegreekberkeley.com", "paths": ["/events"], "max_exa_pages": 6}
  ]
}

(Exa supports domain and path filtering; use it.)  ￼

⸻

9) Acceptance Criteria
	•	Cost: ≥95% of new URLs come from Serper enumeration + local parse; ≤5% of pages require Exa text=true (tunable).  ￼
	•	Coverage: For whitelisted venues, Exa domain/path pass yields additional unique events beyond Serper (tracked via sources).  ￼
	•	Latency: Interactive /events queries served from DB in <150 ms (p95) on dev data.
	•	Simplicity: All provider fusion logic centralized in dualSearch; routes no longer call providers directly except /batch/fetch.

⸻

10) Work Plan for Codex CLI (no code in this doc)

Branching
	•	Create feat/backend-rewrite. Open a draft PR to main immediately so CI runs continuously.

Phase 1 — Orchestrator extraction
	•	Add src/lib/dualSearch.(ts|js) that wraps ExaClient + SerperClient using Promise.allSettled and existing env toggles; implement rules filtering & basic merge with dedup-ready output.
	•	Update experiments/speed-demon/speed-collector.js and src/routes/events.js to call dualSearch (remove duplicated provider orchestration).

Phase 2 — Batch pipeline
	•	Add src/batch/BatchRunner.(ts|js) implementing the 4-step Batch Mode flow above with budget caps and whitelist logic.
	•	Add routes/batch.(ts|js) → POST /batch/fetch.

Phase 3 — Parsers & dedup
	•	Add htmlParser (JSON-LD Event first, fallback to micro-parsers) based on Google/schema.org guidelines.  ￼ ￼
	•	Add dedupe (URL normalization, canonical key, near-dupe clustering).
	•	Add data/whitelist.json and src/lib/whitelist helpers.

Phase 4 — Interactive search
	•	Ensure routes/events.(ts|js) queries only the DB (no provider calls).
	•	Add scoring (BM25 + priors). (BM25 = stable lexical scorer; keeps implementation simple.)

Phase 5 — Telemetry & budgets
	•	Record {serper_calls, exa_calls, exa_text_calls, est_cost_usd} in batch results; log per-domain usage; enforce caps.

Phase 6 — Tests & docs
	•	Add minimal unit tests for parsers & dedup; script a batch smoke test across 2–3 whitelist venues.
	•	Update README/API docs with two-mode behavior and env table.

Definition of Done
	•	Draft PR shows all changes split into small commits per phase; CI green; /events serves data from DB; /batch/fetch runs end-to-end with budget respected.

⸻

11) Operating Rules for Codex CLI (GPT-5 High)

Use these prompting constraints so the agent behaves predictably (derived from OpenAI’s best-practice guidance for GPT-5/4.1 and prompt engineering):
	1.	Plan-then-change: Propose a surgical change plan first (files to touch, new files, schemas), then implement in small commits. Prefer clarity and maintainability over cleverness.  ￼
	2.	Keep instructions up top & structured: Begin each task with concise instructions; separate context with triple quotes if embedding snippets.  ￼
	3.	Local only, no secrets leakage: Use the repo on disk; do not invent API keys. Respect .env loading conventions already present.
	4.	Validate against docs when using provider features:
	•	Exa text=true content retrieval only for failed parses;
	•	Exa includeDomains + path filters for whitelist recall;
	•	Serper for general and site: enumeration.  ￼ ￼
	5.	Show diffs & run checks: After each phase, print changed files, run lints/tests, and note any migration steps.
	6.	No wide refactors outside scope: Frontend untouched except search source switch.
	7.	Explainability: In commit messages and PR description, reference which acceptance criteria are satisfied.

Suggested initial Codex CLI instruction block (paste verbatim before execution):

Role: You are implementing a backend rewrite in curate-events-api to a batch-first architecture.
Do:
	•	Create src/lib/dualSearch, src/batch/BatchRunner, parsers, dedupe, scoring, whitelist loader, and routes/batch.
	•	Route /events to the local dataset only.
	•	Use Serper for enumeration (15–20 results), Exa only for whitelist recall (domain/path filters) and text=true detail rescue under budget caps.
	•	Preserve and extend env flags as specified.
	•	Write small, readable commits; after each phase, run tests and print a summary of changes.
Don’t: change the frontend, add unsupported providers, or exceed Exa budget.
Acceptance: cost/coverage/latency and DoD above.

⸻

12) Risk & Mitigation
	•	Venue pages without JSON-LD → rely on Exa text=true only for those (budget-gated).  ￼
	•	Over-calling Exa → global and per-domain caps + stop when budget reached.
	•	Duplicate logic drift → single orchestrator (dualSearch) used by routes and batch.
	•	Schema variance → prioritize JSON-LD aligned to schema.org/Event & Google’s leaf-page guidance.  ￼ ￼

⸻

If you want, I can also generate a one-page “task checklist” version of this PRD for the PR description once Codex CLI opens the draft PR.