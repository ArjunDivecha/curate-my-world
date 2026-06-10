# PRD: Squirtle Venue Discovery Agent (SVDA)

**Version:** 1.0 (Phase 1 MVP)
**Author:** Arjun Divecha
**Date:** 2026-05-27
**Status:** Ready to implement
**Repo:** `ArjunDivecha/curate-my-world`
**Target completion:** ~1 working day end-to-end

---

## 1. Context

Squirtle's coverage quality is bottlenecked by the size and freshness of `data/venue-registry.json`. The registry is currently maintained manually via `add_venue_registry_strict.py`, which means new Bay Area event sources are added only when Arjun stumbles on them. The Ticketmaster ingestion and the daily 6 AM PT scraper both perform well — the constraint is **discovery**, not ingestion.

SVDA is a weekly off-path agent that proposes new Bay Area venues for human review. It does discovery + feasibility validation only. The existing scraper handles ingestion of approved venues unchanged.

## 2. Goals

- G1. Surface 5–10 net new validated Bay Area venues per month, with monthly precision ≥40% (proposals merged / proposed).
- G2. Zero impact on user request path. Agent runs offline; outputs land in Dropbox as JSON.
- G3. Cost per merged venue under $2 in API spend.
- G4. Human gate on every merge. The agent never writes to `venue-registry.json`.
- G5. Disposable: if precision <20% after 3 runs, the agent is killed without leaving residue in the codebase.

## 3. Non-goals

- Not replacing or augmenting the existing Ticketmaster client or VenueScraperClient.
- Not introducing a moderation UI in this phase. JSON review is sufficient.
- Not implementing an automated scheduler. Manual CLI invocation only.
- Not scraping events. Agent only validates that events are extractable.
- Not multi-category. Phase 1 hardcodes a single category. (See §10 for category selection.)
- Not auto-merging proposals to the registry.

## 4. Architecture

```
+-------------------+        +--------------------+        +----------------+
| run_svda.py (CLI) | -----> | Anthropic API +    | -----> | Dropbox:       |
| (local, manual)   |        | tool use loop:     |        | venue-         |
+-------------------+        |   - web_search     |        | candidates/    |
        |                    |   - web_fetch      |        | YYYY-MM-DD.json|
        |                    |   - run_extraction |        +----------------+
        |                    +--------------------+                |
        v                                                          v
+-------------------+                                    +----------------+
| venue-registry    |  read-only input                   | review_         |
| .json             |                                    | candidates.py  |
+-------------------+                                    | (CLI for merge)|
                                                         +----------------+
                                                                 |
                                                                 v
                                                       +--------------------+
                                                       | venue-registry.json|
                                                       | (human merge only) |
                                                       +--------------------+
```

Two CLIs, one data flow. No backend changes, no new API routes, no frontend changes.

## 5. Tech stack

- Python 3.11+ (matches the existing `requirements.txt` in `curate-my-world`)
- `anthropic` SDK (already a dependency)
- `requests` for direct HTTP (already a dependency)
- `rapidfuzz` for name dedup (new dependency, lightweight)
- Claude model: `claude-sonnet-4-5` for the agent loop, `claude-haiku-4-5-20251001` for extraction validation (matches existing VenueScraper usage)
- No new infra. No DB. No Vercel/Railway changes.

## 6. File structure (new files only)

```
curate-my-world/
└── scripts/
    └── venue-discovery/                  # NEW directory
        ├── README.md
        ├── run_svda.py                   # main agent entrypoint
        ├── review_candidates.py          # human-gate merge CLI
        ├── prompts/
        │   ├── system_prompt.md
        │   └── extraction_prompt.md
        ├── tools/
        │   ├── __init__.py
        │   ├── registry_loader.py        # load venue-registry.json + dedup helpers
        │   ├── url_fetcher.py            # wraps Jina Reader (matches VenueScraperClient pattern)
        │   └── extraction_validator.py   # Haiku extraction proof-of-life
        ├── schemas/
        │   └── candidate_schema.json     # JSON schema for outputs
        ├── eval/
        │   └── run_log_template.md
        └── tests/
            ├── test_registry_loader.py
            ├── test_dedup.py
            └── test_extraction_validator.py
```

Output directory (Dropbox, **not** in repo):
```
/AAA Backup/A Working/curate-my-world-production/venue-candidates/
    YYYY-MM-DD_venue-candidates.json
    YYYY-MM-DD_run-log.md
```

## 7. Data contracts

### 7.1 Input: `venue-registry.json` (existing, read-only)

Already exists at `data/venue-registry.json`. Loaded as-is. The agent reads `name`, `url`, and any `aliases` to perform dedup.

### 7.2 Output: Candidate JSON (new schema)

File: `YYYY-MM-DD_venue-candidates.json`

```json
{
  "schema_version": "1.0",
  "run_date": "2026-06-01",
  "run_id": "svda-2026-06-01-001",
  "category_targeted": "Desi",
  "geographic_scope": ["San Francisco", "Oakland", "Berkeley", "Peninsula", "South Bay", "Marin"],
  "agent_model": "claude-sonnet-4-5",
  "extraction_model": "claude-haiku-4-5-20251001",
  "total_cost_usd": 1.47,
  "candidates": [
    {
      "id": "cand-001",
      "name": "Bhavan Indian Cultural Center",
      "url": "https://bhavansf.org/events",
      "category": "Desi",
      "location": "San Francisco",
      "venue_type": "cultural_center",
      "extraction_score": 0.87,
      "monthly_event_estimate": 8,
      "sample_events": [
        {
          "title": "Carnatic Vocal Concert by ...",
          "date": "2026-06-14",
          "time": "19:30",
          "url": "https://bhavansf.org/events/..."
        }
      ],
      "dedup_status": "novel",
      "closest_existing_match": null,
      "rationale": "Established Indian cultural center, hosts ~2 events/week. Structured event listing page. Not in registry.",
      "agent_confidence": 0.82
    }
  ],
  "rejected_candidates": [
    {
      "url": "https://example.com/events",
      "rejection_reason": "no_structured_events" 
    }
  ]
}
```

Rejection reasons (closed set): `no_structured_events`, `geographic_mismatch`, `category_mismatch`, `duplicate_existing`, `dead_site`, `extraction_failed`, `low_event_volume`.

### 7.3 Run log (Markdown, sidecar)

File: `YYYY-MM-DD_run-log.md`. Contains: queries issued, URLs visited, total tokens, total cost, decisions made. Used for offline evaluation. Template at `scripts/venue-discovery/eval/run_log_template.md`.

## 8. Agent design

### 8.1 System prompt

Stored at `scripts/venue-discovery/prompts/system_prompt.md`. Full text:

```
You are the Squirtle Venue Discovery Agent. Your job is to propose new Bay Area
event venues for human review.

GEOGRAPHIC SCOPE (strict):
- San Francisco, Oakland, Berkeley, Peninsula (San Mateo through Palo Alto),
  South Bay (San Jose, Mountain View, Cupertino), Marin (Mill Valley, San Rafael).
- Reject anything in Sacramento, LA, San Diego, or outside California.

CATEGORY THIS RUN: {category}
Definition of "{category}" matches Squirtle's existing taxonomy. {category_description}

TASK:
1. Identify ~10 candidate venues in scope.
2. For each candidate: fetch its events page, verify it has structured event
   listings, extract 3 sample events with date+title+URL, and score the
   extraction quality.
3. Dedupe against the existing registry I will provide.
4. Output a ranked JSON list of candidates with proof-of-life sample events.

CONSTRAINTS:
- A candidate is only valid if you successfully fetched its URL AND extracted
  at least 1 real upcoming event with a real date and title.
- Never invent URLs. Only propose venues whose event pages you have actually
  fetched in this session.
- If you cannot extract structured events, reject the candidate with reason
  "no_structured_events" — do not propose it anyway.
- Prefer venues with monthly event volume ≥3.
- Output strictly conforming JSON. No prose outside the JSON object.

TOOLS AVAILABLE:
- web_search: find candidate venues
- web_fetch: retrieve the events page of a candidate
- run_extraction: validate that structured events are extractable from a page

STOP CONDITIONS:
- You have 10 validated candidates, OR
- You have used 25 web_fetch calls, OR
- You have spent more than $2 in API costs (you will be told when approaching)
```

`{category}` and `{category_description}` are templated at runtime.

### 8.2 Tools exposed to the agent

Three custom tools, defined via Anthropic tool use:

| Tool name | Purpose | Implementation |
|---|---|---|
| `web_search` | Find candidate venues | Anthropic native `web_search_20250305` |
| `web_fetch` | Retrieve event page contents | Wraps Jina Reader, same pattern as existing `VenueScraperClient.js` (port the URL pattern to Python) |
| `run_extraction` | Validate structured event extraction | Calls Haiku with `extraction_prompt.md` against the fetched page, returns count of valid events + sample |

`run_extraction` returns:
```json
{
  "valid_events_found": 3,
  "extraction_score": 0.87,
  "sample_events": [...],
  "page_quality_notes": "Clear event listing with dates and times"
}
```

### 8.3 Agent loop control

- Max iterations: 30 tool calls total.
- Hard cost cap: $3.00 per run (kill switch).
- Timeout: 15 minutes wall clock.
- On any tool error, log to run log and continue with remaining candidates.

## 9. Dedup logic (`registry_loader.py`)

Two-stage check:

1. **URL canonicalization match.** Strip protocol, `www.`, trailing slashes, query strings. Lowercase. Exact match → `dedup_status: "duplicate_existing"`.
2. **Fuzzy name match.** `rapidfuzz.fuzz.token_set_ratio` against existing venue names + aliases. Threshold ≥85 → `dedup_status: "likely_duplicate"`, include `closest_existing_match` field. Threshold ≥95 → `duplicate_existing` (auto-reject).

Below 85 → `dedup_status: "novel"`.

## 10. Category selection for Phase 1

**Phase 1 ships with category hardcoded to `Desi`.**

Rationale: Arjun has ground truth on this category, it's underrepresented in mainstream aggregators, and Ticketmaster has weak coverage, so the marginal value of new venues is highest. The agent will be told explicitly: "Desi = events oriented toward South Asian / Indian diaspora audiences: classical and devotional music, cultural festivals, Bollywood/regional film screenings, dance, religious observances, food festivals, comedy and theatre in South Asian languages."

After 4 successful runs, the next categories to add are **Lectures** and **Tech** (in that order), driven by gap analysis from `/api/events/refresh-status`.

## 11. CLI specs

### 11.1 `run_svda.py`

```
python scripts/venue-discovery/run_svda.py \
    --category Desi \
    --output-dir "/Users/arjun/Library/CloudStorage/Dropbox/AAA Backup/A Working/curate-my-world-production/venue-candidates" \
    --max-candidates 10 \
    --dry-run false
```

Required flags:
- `--category` (str, required): which category to target
- `--output-dir` (str, required): where the JSON + run log are written

Optional flags:
- `--max-candidates` (int, default 10)
- `--dry-run` (bool, default false): if true, runs the agent but writes output to `./tmp/` instead of Dropbox
- `--registry-path` (str, default `data/venue-registry.json`)

Exit codes: 0 success, 1 cost cap hit, 2 timeout, 3 agent error, 4 no candidates found.

Behavior:
1. Load registry.
2. Initialize agent with system prompt + tools.
3. Run agent loop until stop condition.
4. Validate output JSON against `candidate_schema.json`.
5. Write `YYYY-MM-DD_venue-candidates.json` and `YYYY-MM-DD_run-log.md`.
6. Print summary to stdout: # candidates, # rejected, total cost, output path.

### 11.2 `review_candidates.py`

```
python scripts/venue-discovery/review_candidates.py \
    --input "/Users/arjun/.../venue-candidates/2026-06-01_venue-candidates.json" \
    --registry data/venue-registry.json
```

Behavior:
1. Load candidate JSON.
2. For each candidate, print:
   - Name, URL, location, score, monthly event estimate
   - 3 sample events
   - Rationale
3. Prompt: `[a]ccept / [r]eject / [s]kip / [q]uit?`
4. On accept: append to `venue-registry.json` in the existing schema, save with timestamped backup.
5. On reject/skip: log decision to a `review-decisions.jsonl` file for eval purposes.
6. On quit: save progress; resumable on next invocation.

**The merge to `venue-registry.json` is the only write to repo data, and only happens on explicit `a` keypress.**

## 12. Implementation tasks (ordered)

| # | Task | LOC est | Depends on |
|---|---|---|---|
| 1 | Set up `scripts/venue-discovery/` directory, README, dependencies in `requirements.txt` | 30 | — |
| 2 | Implement `tools/registry_loader.py` with URL canonicalization + fuzzy dedup | 80 | 1 |
| 3 | Implement `tools/url_fetcher.py` (port Jina Reader call from JS to Python) | 60 | 1 |
| 4 | Implement `tools/extraction_validator.py` (Haiku call with extraction prompt) | 100 | 1 |
| 5 | Write `prompts/system_prompt.md` and `prompts/extraction_prompt.md` | 30 | — |
| 6 | Write `schemas/candidate_schema.json` (full JSON Schema for validation) | 80 | — |
| 7 | Implement `run_svda.py` agent loop with tool dispatch | 250 | 2,3,4,5,6 |
| 8 | Implement `review_candidates.py` interactive CLI + backup logic | 150 | 6 |
| 9 | Write `eval/run_log_template.md` | 30 | — |
| 10 | Tests for registry_loader (5 cases: canonical match, fuzzy match, novel, alias hit, URL variant) | 80 | 2 |
| 11 | Tests for extraction_validator (mock 3 page types) | 80 | 4 |
| 12 | End-to-end smoke test with `--dry-run` on Desi category | — | 7 |
| 13 | First real run, manual review with `review_candidates.py` | — | 7,8 |

Total new code: ~970 LOC + tests. One focused day for an IDE agent.

## 13. Acceptance criteria

Phase 1 ships when **all** of these are true:

- [ ] `python run_svda.py --category Desi --dry-run true` produces a valid JSON output that passes `candidate_schema.json` validation.
- [ ] All proposed candidates have a `url` that was actually fetched in the session AND at least 1 `sample_events[]` entry with a real future date.
- [ ] Dedup against the existing registry correctly flags 100% of seeded duplicates in `test_dedup.py`.
- [ ] Total cost of a 10-candidate run is ≤ $2.50.
- [ ] `review_candidates.py` writes accepted venues to `venue-registry.json` in the existing schema, and a backup is created at `data/venue-registry.json.bak-YYYY-MM-DDTHH-MM-SS` before any write.
- [ ] Run log captures: every URL fetched, every web search query, total tokens by model, total cost.
- [ ] No production code paths (`curate-events-api/`, `src/`) are modified.

## 14. Risks and mitigations

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Hallucinated URLs in output | Medium | High | Schema validator + tool-side proof-of-life: candidate is only included if `web_fetch` succeeded AND `run_extraction` returned ≥1 event |
| Geographic drift (LA/Sacramento) | Medium | Medium | Explicit allowlist in system prompt + post-validation against city/region in URL+content |
| Duplicates against existing registry | High in early runs | Low | Two-stage dedup (URL + fuzzy name); also dedups within the same run output |
| Low precision (<40%) in early weeks | High | Medium | Kill-switch after 3 runs at <20%; expected ramp curve in eval log |
| Cost overrun | Low | Medium | Hard $3 cap in agent loop; tracked per tool call |
| Registry write corrupts existing data | Low | High | Mandatory timestamped backup before every write in `review_candidates.py`; atomic rename pattern |
| Jina Reader rate limits | Low | Low | Match existing VenueScraperClient retry semantics; back off and skip on persistent failure |

## 15. Eval / kill criteria

Track in `eval/run-decisions.jsonl` (one row per candidate review):
```json
{"run_date":"2026-06-01","candidate_id":"cand-003","decision":"accept","reviewer_note":""}
```

Compute weekly:
- **Precision** = accepts / (accepts + rejects). Skips excluded.
- **Yield** = accepts per run.
- **Cost-per-merge** = total_cost / accepts.

**Kill condition:** Precision < 0.20 averaged over runs 1–3. Tear-down: delete `scripts/venue-discovery/`, remove `rapidfuzz` from `requirements.txt`, keep eval logs.

**Expansion condition:** Precision ≥ 0.40 averaged over runs 1–4. Then: add `--category Lectures` and `--category Tech` options, add gap-detection logic that picks the weakest category automatically from `/api/events/refresh-status`.

## 16. Open questions for Arjun

1. **Output location.** Confirm Dropbox path `/AAA Backup/A Working/curate-my-world-production/venue-candidates/` is correct, or prefer a different folder?
2. **Haiku vs Sonnet for extraction.** Existing VenueScraperClient uses Haiku. PRD assumes same. Confirm.
3. **Category "Desi" definition for the system prompt** — paste your preferred one-paragraph definition, or use the one drafted in §10?
4. **Eval cadence.** Manual review same day as the agent run, or batched weekly?
5. **Anthropic API key source.** New env var `SVDA_ANTHROPIC_API_KEY`, or reuse the same key as `curate-events-api`?

## 17. Out of scope (Phase 2+)

- Automated scheduling (cron / GitHub Actions weekly trigger).
- `/api/venues/candidates` backend endpoint for proposals.
- Admin route in the Vercel frontend for proposal review.
- Multi-category gap detection driven by `refresh-status`.
- Auto-merge for very-high-confidence candidates (score ≥ 0.95 AND extraction_score ≥ 0.95).
- Cross-venue dedup (i.e., two new candidates that are aliases of each other).
- Event-volume backtest: actually pull events from approved venues over 30 days, measure ingestion success rate.

---

**End of PRD.**
