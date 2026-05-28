# PRD: Squirtle Venue Discovery Agent (SVDA)

**Version:** 2.1 (Claude Code Routine architecture)
**Author:** Arjun Divecha
**Date:** 2026-05-27
**Status:** Ready to implement
**Repo:** `ArjunDivecha/curate-my-world`
**Runtime:** Claude Code Routine (Anthropic-managed, scheduled weekly)
**Target completion:** ~half a day end-to-end

---

## 1. Context

Squirtle's coverage quality is bottlenecked by the size and freshness of `data/venue-registry.json`. The registry is currently maintained manually via `add_venue_registry_strict.py`. Ticketmaster ingestion and the daily 6 AM PT scraper both perform well — the constraint is **discovery**, not ingestion.

SVDA is a **Claude Code Routine** that runs every Sunday at 22:00 PT on Anthropic-managed infrastructure. It proposes new Bay Area venues for human review by opening a PR against `curate-my-world`. The existing scraper handles ingestion of approved venues unchanged.

This is a managed agent, not a local script. There is no cron, no laptop dependency, no API key juggling, no infrastructure to maintain.

## 2. Goals

- G1. Surface 5–10 net new validated Bay Area venues per month, with monthly precision ≥40% (PR rows merged / PR rows proposed).
- G2. Runs weekly on Anthropic infrastructure with zero local touchpoints. Survives laptop closed, Wi-Fi drops, travel.
- G3. Cost per merged venue under $2 in API spend.
- G4. Human gate on every merge via the PR review surface — agent never lands writes to `main`.
- G5. Disposable: if precision <20% after 3 runs, the routine is deleted and the in-repo skill is removed without leaving residue.

## 3. Non-goals

- Not replacing or augmenting `TicketmasterClient.js` or `VenueScraperClient.js`.
- Not introducing a moderation UI or backend endpoint in this phase.
- Not running locally. No Python CLI. No cron.
- Not scraping events. Agent only validates that events are extractable.
- Not multi-theme. Phase 1 hardcodes the Desi discovery theme in the routine prompt.
- Not auto-merging PRs. Human merge only.

## 4. Architecture

```
                  ┌─────────────────────────────────────┐
                  │ Claude Code Routine: svda-weekly    │
                  │ Trigger: cron "0 22 * * 0" (PT)     │
                  │ Repo: ArjunDivecha/curate-my-world  │
                  │ Branch policy: claude/svda-*        │
                  │ Model: claude-sonnet-4-5            │
                  └─────────────────────────────────────┘
                                   │
                                   ▼
        ┌──────────────────────────────────────────────────┐
        │ Anthropic-managed session                        │
        │  1. Clone repo                                   │
        │  2. Read .claude/skills/venue-discovery/SKILL.md │
        │  3. Read data/venue-registry.json                │
        │  4. web_search + web_fetch loop                  │
        │  5. Validate extraction from fetched pages       │
        │  6. Dedup against registry                       │
        │  7. Write data/venue-candidates/YYYY-MM-DD.json  │
        │  8. Append proposed rows to venue-registry.json  │
        │  9. Commit to claude/svda-YYYY-MM-DD branch      │
        │ 10. Open PR with structured summary              │
        └──────────────────────────────────────────────────┘
                                   │
                                   ▼
                     ┌──────────────────────────┐
                     │ GitHub PR (human review) │
                     │ — Arjun edits/keeps/cuts │
                     │   rows, merges or closes │
                     └──────────────────────────┘
```

Two artifacts the agent produces every run:
1. **`data/venue-candidates/YYYY-MM-DD.json`** — full proposal record with rejections, costs, run log. Audit trail.
2. **Direct edit to `data/venue-registry.json`** — only high-confidence proposed registry rows, appended in registry format on the PR branch. The PR diff is what Arjun reviews.

The two-file pattern means Arjun reviews a clean diff on the registry, and can always inspect the full reasoning in the candidates JSON sidecar.

## 5. Tech stack

- **Runtime:** Claude Code Routine on Anthropic-managed cloud infrastructure.
- **Trigger type:** Schedule (cron). Optionally add an API trigger later for manual kicks.
- **Model:** Sonnet for the agent loop. Extraction validation is done by the same routine after fetching pages; no separate API key is required for Phase 1.
- **Repo integration:** GitHub. Branch prefix `claude/svda-*`. Default branch protection on `main` — agent cannot push there.
- **In-repo dependencies:** None new. The skill is pure Markdown.
- **No Vercel, Railway, Postgres, frontend, or backend changes.**

## 6. File structure (new files only)

```
curate-my-world/
├── .claude/
│   └── skills/
│       └── venue-discovery/
│           └── SKILL.md                              # NEW: operational knowledge for the agent
├── data/
│   ├── venue-registry.json                           # existing; agent appends to this
│   └── venue-candidates/                             # NEW directory
│       ├── README.md                                 # NEW: explains the artifacts
│       ├── 2026-XX-XX_candidates.json                # written by each weekly run
│       └── schema.json                               # NEW: JSON Schema for validation
└── docs/
    └── svda/
        ├── ROUTINE_CONFIG.md                         # NEW: how the routine is configured
        ├── PROMPT.md                                 # NEW: the exact routine prompt
        └── EVAL_LOG.md                               # NEW: running log of run outcomes
```

That's it. Six new files, no Python, no new dependencies.

## 7. Data contracts

### 7.1 Input: `data/venue-registry.json` (existing)

Read by the agent at the start of each session. Used for dedup. Agent appends proposed registry rows here on the PR branch only (in the existing schema — agent must read the schema and match it).

### 7.2 Output A: `data/venue-candidates/YYYY-MM-DD_candidates.json`

```json
{
  "schema_version": "1.0",
  "run_date": "2026-06-07",
  "run_id": "svda-2026-06-07",
  "routine_session_url": "https://claude.ai/code/sessions/...",
  "category_targeted": "Desi",
  "geographic_scope": ["San Francisco", "Oakland", "Berkeley", "Peninsula", "South Bay", "Marin"],
  "agent_model": "claude-sonnet-4-5",
  "extraction_model": "claude-haiku-4-5-20251001",
  "total_cost_usd": 1.47,
  "session_duration_minutes": 18,
  "candidates_proposed": [
    {
      "id": "cand-001",
      "name": "Bhavan Indian Cultural Center",
      "url": "https://bhavansf.org/events",
      "discovery_theme": "Desi",
      "registry_category": "desi",
      "location": "San Francisco",
      "venue_type": "cultural_center",
      "extraction_score": 0.87,
      "monthly_event_estimate": 8,
      "sample_events": [
        {
          "title": "Carnatic Vocal Concert by …",
          "date": "2026-06-14",
          "time": "19:30",
          "url": "https://bhavansf.org/events/…"
        }
      ],
      "dedup_status": "novel",
      "closest_existing_match": null,
      "rationale": "Established Indian cultural center, ~2 events/week, structured listings.",
      "agent_confidence": 0.82,
      "registry_row_proposed": true
    }
  ],
  "candidates_rejected": [
    {
      "url": "https://example.com/events",
      "rejection_reason": "no_structured_events"
    }
  ]
}
```

Rejection reasons (closed enum): `no_structured_events`, `geographic_mismatch`, `category_mismatch`, `duplicate_existing`, `dead_site`, `extraction_failed`, `low_event_volume`.

### 7.3 Output B: append to `data/venue-registry.json`

Agent appends only the rows where `registry_row_proposed: true` (per the cutoff in §10). Schema match against existing registry is mandatory.

## 8. Routine configuration

Create at `claude.ai/code/routines` → New Routine.

| Field | Value |
|---|---|
| Name | `svda-weekly` |
| Description | Squirtle Venue Discovery Agent — proposes new Bay Area venues weekly |
| Model | `claude-sonnet-4-5` |
| Trigger | Schedule: cron `0 22 * * 0`, timezone `America/Los_Angeles` |
| Repository | `ArjunDivecha/curate-my-world`, branch `main` |
| Branch policy | Allow `claude/` prefix only (default) |
| Connectors | None required for Phase 1 (web tools are native to routines) |
| Environment variables | None required for Phase 1 |
| Prompt | See `docs/svda/PROMPT.md` (committed to repo, copy-pasted into routine config) |
| Daily run cap | 1 (we only want one run/week anyway; this is a safety cap) |

The routine config is also documented in `docs/svda/ROUTINE_CONFIG.md` so it can be reconstructed if accidentally deleted.

## 9. The agent prompt (full text)

Stored at `docs/svda/PROMPT.md`, pasted verbatim into the Routine prompt field:

```
You are the Squirtle Venue Discovery Agent (SVDA). You run weekly on Anthropic-managed
infrastructure to propose new Bay Area event venues for the Squirtle event aggregator.

WORKFLOW
1. Read `.claude/skills/venue-discovery/SKILL.md` for the operational rules.
2. Read `curate-events-api/src/utils/categoryMapping.js` and use it as the live source of truth for registry category keys.
3. Read `data/venue-registry.json` and load all existing venues for dedup.
4. Target discovery theme for this run: Desi.
5. Use web_search to find ~10 candidate Bay Area venues in scope.
6. For each candidate:
   a. Fetch the events page via web_fetch.
   b. Verify it has structured event listings.
   c. Validate extraction: pull 3 sample events with title + date + URL.
   d. Dedup against the existing registry (URL + fuzzy name).
   e. Score the candidate.
7. Write the full run record to `data/venue-candidates/{YYYY-MM-DD}_candidates.json`
   conforming to the schema in `data/venue-candidates/schema.json`.
8. For each candidate with agent_confidence >= 0.70 AND extraction_score >= 0.70 AND
   dedup_status = "novel", append a row to `data/venue-registry.json` matching the
   existing schema.
9. Commit both files to a new branch named `claude/svda-{YYYY-MM-DD}`.
10. Open a PR titled "SVDA weekly run {YYYY-MM-DD}: {N} candidates ({K} registry rows proposed)" with a
   structured body covering: # proposed, # registry rows proposed, # rejected (by reason), total cost,
   session duration, and a one-line summary per proposed registry row.

HARD CONSTRAINTS
- Geographic scope: SF, Oakland, Berkeley, Peninsula (San Mateo–Palo Alto), South Bay
  (San Jose, Mountain View, Cupertino), Marin. Reject everything else.
- Never invent URLs. Only propose venues whose events page you actually fetched.
- Never push to main. Only to claude/svda-* branches.
- Stop if you have spent more than $3.00 in this session.
- Stop after 30 tool calls.
- Maximum session duration: 30 minutes.

OUTPUT FORMAT
- JSON sidecar must conform to schema (validate before commit).
- Registry append must match existing schema exactly.
- PR body: Markdown, tables for the registry rows proposed section.
- A green Routine status is not enough; inspect the run transcript for task-level network, tool, validation, and branch-permission failures.

See SKILL.md for the full category definition, dedup thresholds, scoring rubric,
and rejection taxonomy.
```

## 10. The skill (`.claude/skills/venue-discovery/SKILL.md`)

The skill is the agent's operational manual. It lives in the repo so version control captures every rule change and so the Routine can load it from the fresh clone.

The committed skill must include Claude Code skill frontmatter with at least a `description`. The current implementation covers:

- Required reads: `categoryMapping.js`, `venue-registry.json`, and `schema.json`.
- Phase 1 discovery theme: human-facing `Desi`; registry category normally `desi` because `CATEGORY_CONFIG` currently defines it.
- Strict Bay Area geographic allowlist.
- Candidate proof requirements: fetched event page, future sample event, non-aggregator source.
- URL/domain/name dedup thresholds.
- `extraction_score` and `agent_confidence` rubric.
- `registry_row_proposed` cutoff.
- Registry row shape and `source: "svda_weekly"`.
- Closed rejection reason enum.
- Validation and PR requirements.

## 11. Discovery theme selection for Phase 1

**Phase 1 ships with the Desi discovery theme hardcoded** in the routine prompt. Rationale: Arjun has ground truth, Ticketmaster has weak coverage, marginal value is highest.

Registry rows should use canonical category keys from `curate-events-api/src/utils/categoryMapping.js`. In the current codebase, South Asian diaspora sources map to `desi`.

After 4 successful runs (precision ≥0.40), add `Lectures` and `Tech` by editing `docs/svda/PROMPT.md` and re-saving the routine.

## 12. Implementation tasks (ordered)

| # | Task | Where | Effort |
|---|---|---|---|
| 1 | Create `.claude/skills/venue-discovery/SKILL.md` with §10 content | Repo | 30 min |
| 2 | Create `data/venue-candidates/schema.json` with §7.2 as JSON Schema | Repo | 20 min |
| 3 | Create `data/venue-candidates/README.md` | Repo | 10 min |
| 4 | Create `docs/svda/PROMPT.md` with §9 prompt | Repo | 10 min |
| 5 | Create `docs/svda/ROUTINE_CONFIG.md` | Repo | 15 min |
| 6 | Create `docs/svda/EVAL_LOG.md` template | Repo | 10 min |
| 7 | Commit all on a feature branch, open PR, merge after review | Repo | 10 min |
| 8 | Create the routine at `claude.ai/code/routines` per §8 | Anthropic | 10 min |
| 9 | Fire routine via "Run now" for smoke test | Anthropic | 20 min wall, ~$2 |
| 10 | Review smoke test PR; iterate on SKILL.md if extraction quality is poor | Repo | up to 1 hr |
| 11 | Enable schedule trigger, confirm next Sunday 22:00 PT activation | Anthropic | 2 min |

Total: ~600 lines Markdown + JSON. No code. **Half a day** end-to-end.

## 13. Acceptance criteria

Phase 1 ships when ALL are true:

- [ ] All six new files committed to `main` on `curate-my-world`.
- [ ] `svda-weekly` routine exists at `claude.ai/code/routines` with schedule `0 22 * * 0 America/Los_Angeles`.
- [ ] One "Run now" smoke test executes end-to-end and opens a real PR.
- [ ] Smoke test PR contains both `data/venue-candidates/YYYY-MM-DD_candidates.json` AND zero-or-more new rows in `data/venue-registry.json`.
- [ ] Smoke test JSON validates against `schema.json`.
- [ ] All proposed candidates have a fetched URL AND ≥1 sample event with a real future date.
- [ ] Dedup against existing registry flags any obvious duplicates correctly (manually verify by seeding a known duplicate).
- [ ] Total smoke-test session cost ≤ $2.50.
- [ ] Routine cannot push to `main` (branch protection verified).
- [ ] Run transcript is opened and inspected; no hidden network, connector, validation, or branch-permission failures.

## 14. Risks and mitigations

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Routine pushes bad data to `main` | Low | Critical | GitHub branch protection on `main`; `claude/` prefix policy. **Verify before first run.** |
| Hallucinated venues in PR | Medium | High | Skill rule: candidate must have fetched URL + 3 real future-dated events |
| Geographic drift | Medium | Medium | Strict allowlist in skill; reject before scoring; manual spot-check first 3 runs |
| Schema drift on registry append | Medium | High | Skill requires agent to read registry and match schema; PR diff makes mismatch obvious |
| Cost overrun | Low | Low | $3 hard cap in prompt; Console billing visibility |
| Default cloud network blocks shell fetches | Medium | Medium | Prefer native `web_search`/`web_fetch`; if shell traffic gets `host_not_allowed`, update the Routine environment allowlist |
| Green Routine status masks task failure | Medium | Medium | Acceptance requires transcript inspection; green status only means no infrastructure error |
| Routine accidentally deleted | Low | Low | Config in `docs/svda/ROUTINE_CONFIG.md` — re-create in 10 min |
| Daily run cap blocks needed re-runs | Low | Low | Cap=1; "Run now" doesn't count against schedule cap |
| Extraction quality varies wildly site-to-site | High | Medium | Per-page extraction_score makes this visible; iterate on skill over first 3 runs |
| Routine product changes during preview | Medium | Low | Config docs in repo; migration path is "read updated Anthropic docs, adjust" |

## 15. Eval / kill criteria

Append one row to `docs/svda/EVAL_LOG.md` after each PR review:

```
| Date | Proposed | Registry Proposed | Merged | Precision | Cost | Notes |
|------|----------|-------------------|--------|-----------|------|-------|
| 2026-06-07 | 9 | 6 | 4 | 0.67 | $1.83 | One geo miss; SKILL needs explicit Marin examples |
```

**Precision** = merged / registry rows proposed. **Yield** = merged per run. **Cost-per-merge** = run cost / merged.

**Kill condition:** Precision < 0.20 averaged over runs 1–3. Tear-down:
1. Delete routine at `claude.ai/code/routines`.
2. PR to delete `.claude/skills/venue-discovery/` and `docs/svda/`.
3. Keep `data/venue-candidates/` history as audit trail.

**Expansion condition:** Precision ≥ 0.40 averaged over runs 1–4. Then:
1. Add `Lectures` and `Tech` discovery themes to the skill.
2. Rotate discovery themes run-over-run (round-robin or gap-driven).
3. Consider adding GitHub-trigger variant: re-run on every merge to `venue-registry.json`.

## 16. Open questions for Arjun

1. **Confirm GitHub branch protection** on `main` of `curate-my-world` before first routine run.
2. **Routine quota.** Current daily Claude Code routine cap? 1 run/week + occasional smoke tests should fit.
3. **Desi definition.** Confirm or rewrite the paragraph in SKILL.md §10. Single biggest quality lever.
4. **Existing `venue-registry.json` schema and categories.** Re-read `categoryMapping.js` and include a worked registry-row example before first run if the schema is idiosyncratic.
5. **PR reviewer.** Just you, or auto-request someone? Default: just you.

## 17. Out of scope (Phase 2+)

- Multi-theme, gap-driven targeting (round-robin or `refresh-status`-driven).
- API trigger on the routine for manual kicks via webhook.
- GitHub trigger: re-run on certain PR merges.
- Self-evaluating outcomes loop (Managed Agents outcomes feature).
- Dreaming: scheduled memory consolidation of past runs into the skill.
- Multi-agent orchestration: lead agent delegating per-category to sub-agents.
- Splitting the agent: discovery-only run produces JSON, separate routine cherry-picks into registry.
- Event-volume backtest: pull events from merged registry rows over 30 days, measure ingestion success.

---

**End of PRD v2.**
