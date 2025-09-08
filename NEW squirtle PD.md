Backend Rewrite — Single Checklist for Codex CLI (GPT-5 High)

Paste this checklist into your draft PR description and hand it to Codex CLI as the working brief. It’s scoped to your repo and cites best-practice sources where claims matter.

⸻

A. Branch, PR, and Guardrails
	•	Create feature branch feat/backend-rewrite; open a draft PR to main so CI runs on every commit.
	•	Keep frontend unchanged (except search now hits dataset endpoint).
	•	Require small, reviewable commits; after each step print changed files + run tests (Codex: plan → act in small diffs).  ￼

⸻

B. Files to Add (Backend)
	•	curate-events-api/src/lib/dualSearch.(ts|js) — single orchestrator for Exa + Serper (parallel via Promise.allSettled), rules filtering, merge, dedup-ready output.
	•	curate-events-api/src/lib/htmlParser.(ts|js) — JSON-LD Event first (schema.org), fallback HTML micro-parsers for title/date/time/venue/tickets/image/price.  ￼
	•	curate-events-api/src/lib/dedupe.(ts|js) — URL normalize, canonical key {title|performer}_{localDate}_{venueNorm}, near-dup clustering (shingles + MinHash/LSH).  ￼ ￼
	•	curate-events-api/src/lib/scoring.(ts|js) — BM25 lexical score over title+desc+venue + simple priors (known venue, has tickets/price/image, near-term date).  ￼
	•	curate-events-api/src/lib/whitelist.(ts|js) — load & enforce data/whitelist.json (domains, allowed paths, per-domain caps).
	•	curate-events-api/src/batch/BatchRunner.(ts|js) — batch pipeline (enumerate → parse → selective Exa → dedupe → persist) with budget caps + progress metrics.
	•	curate-events-api/src/routes/batch.(ts|js) — POST /batch/fetch to kick off BatchRunner and stream progress.
	•	curate-events-api/data/whitelist.json — venue domains & path filters (e.g., /events, /calendar) + per-domain max_exa_pages. (Exa supports domain and path filtering.)  ￼

⸻

C. Refactors (Remove Duplicate Orchestration)
	•	Update curate-events-api/src/routes/events.js to use DB-backed dataset only (no provider calls in interactive mode).
	•	Repoint experiments/speed-demon/speed-collector.js to call dualSearch (avoid drift).

⸻

D. Batch Mode (runs on launch or “Fetch Events”)
	1.	Serper enumeration (cheap breadth)
	•	Build query grid: (city × category × timeWindow) + site:domain for whitelisted venues.
	•	Fetch 15–20 URLs per query (SERPER_RESULTS_PER_QUERY); capture single-event vs listing pages. (Serper markets very low cost Google SERP with fast latency.)  ￼
	2.	Local parsing
	•	Try JSON-LD Event first (Google recommends JSON-LD; “leaf” single-event pages); fallback to HTML micro-parsers.  ￼
	3.	Selective Exa (whitelist-only)
	•	Recall: Exa includeDomains + path filters (e.g., /events, /calendar) to surface venue posts SERPs may bury; take top-K per domain.  ￼
	•	Detail rescue: If vital fields (date/venue) missing after our parse, call Exa contents retrieval text=true (returns cleaned markdown) then re-parse. Whitelist domains only.  ￼
	•	Enforce BATCH_EXA_BUDGET_USD, BATCH_EXA_MAX_CALLS, and per-domain caps.
	4.	Deduplicate & persist
	•	Collapse exact URL dupes; cluster near-dups via MinHash/LSH; keep richest metadata; persist provenance.
	•	Store fields: sources[], content_source ("jsonld"|"html"|"exa_text"), extraction_confidence, cluster_id, merged_from[], fetch_meta{serper_calls, exa_calls, exa_text_calls, est_cost_usd}.  ￼

⸻

E. Interactive Mode (default UX)
	•	/events queries only the local dataset; no provider calls by default.
	•	Rank with BM25 + priors; optional MMR for diversity if needed.  ￼
	•	“Broaden” option (if user requests): run Serper refresh only, fuse with local via RRF, then re-rank (keep Exa off here by default).  ￼ ￼

⸻

F. Environment & Config
	•	Keep existing: EXA_ENABLED, SERPER_ENABLED, VENUE_EXA_ENABLED, EXA_RESULTS_PER_QUERY (3–5), SERPER_RESULTS_PER_QUERY (15–20).
	•	Add batch knobs:
BATCH_TIME_WINDOW_DAYS=30, WHITELIST_EXA_ENABLED=true,
WHITELIST_EXA_TEXT=false (flip to true only on failed parses),
BATCH_EXA_BUDGET_USD, BATCH_EXA_MAX_CALLS, PER_DOMAIN_EXA_CAP.  ￼

⸻

G. API Surface (keep FE stable)
	•	POST /batch/fetch → run BatchRunner; return progress & tallies.
	•	GET /events → dataset search: q, category, city, dateRange, price, venueIds, hasTickets, page, pageSize.
	•	GET /events/:id → detail view from stored fields.
	•	FE: search bar now hits /events (dataset), not providers.

⸻

H. Metrics & Budgets
	•	Log provider usage & cost estimates {serper_calls, exa_calls, exa_text_calls, est_cost_usd}.
	•	Hard-stop Exa when global or per-domain caps hit; batch still succeeds with Serper-only.
	•	Report added unique events from Exa for whitelisted venues (recall uplift).

⸻

I. Tests & Validation
	•	Unit tests: JSON-LD extraction; fallback parsers; near-dup clustering; RRF fusion path.
	•	Batch smoke test: 2–3 whitelisted venues; confirm recall uplift vs Serper-only and Exa budget compliance.
	•	Validate JSON-LD with Google Rich Results Test guidance (sanity).  ￼

⸻

J. Acceptance Criteria (Done means)
	•	Cost: ≥95% of new URLs from Serper + local parse; ≤5% require Exa text=true (tunable). Serper positioned as ultra-low cost per query.  ￼
	•	Coverage: For whitelisted venues, Exa (domain/path) yields unique events beyond Serper (tracked via sources/metrics).  ￼
	•	Latency: /events (DB-backed) p95 < 150 ms on dev data.
	•	Simplicity: All provider fusion centralized in dualSearch; interactive routes do not call providers.

⸻

K. Provider Usage Rules (embed in code comments)
	•	Serper = enumerator (cheap breadth; site:domain allowed).  ￼
	•	Exa = whitelist scalpel:
	•	Domain/path recall for /events//calendar sections.  ￼
	•	Content rescue with text=true only when JSON-LD/HTML parse fails.  ￼

⸻

L. Codex CLI Kickoff (paste this to the agent)
	•	Role & scope: Implement items A–K. Backend only; no FE changes aside from using /events.
	•	Plan then act: Propose a short step plan; implement in small commits; after each step print changed files + run tests.  ￼
	•	Grounding: Use data/whitelist.json, Exa path filters & text=true, Serper for enumeration, JSON-LD Event first, BM25 ranking, RRF when “broaden”.  ￼ ￼ ￼ ￼ ￼
	•	Constraints: Respect Exa budgets & caps; no provider calls in interactive routes; no secrets leaked; read keys from existing .env.

⸻

Key references
	•	Serper (fast, low-cost Google SERP API).  ￼
	•	Exa contents retrieval (text=true).  ￼
	•	Exa domain/path filter support.  ￼
	•	Google Event structured-data & JSON-LD guidance.  ￼
	•	BM25 (Elastic explainer).  ￼
	•	RRF (Azure/Elastic docs).  ￼ ￼
	•	Near-duplicate detection via MinHash/LSH.  ￼ ￼

⸻

This is the single checklist Codex can follow end-to-end.