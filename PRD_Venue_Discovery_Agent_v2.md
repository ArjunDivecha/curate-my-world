# PRD: Squirtle Venue Discovery Agent (SVDA)

**Version:** 2.2 (Claude Managed Agents architecture)
**Author:** Arjun Divecha
**Date:** 2026-05-27
**Status:** Ready to implement
**Repo:** `ArjunDivecha/curate-my-world`
**Runtime:** Claude Managed Agents API, Anthropic-managed cloud environment
**Scheduler:** GitHub Actions weekly trigger starts a Managed Agents session

---

## 1. Context

Squirtle's coverage quality is bottlenecked by the size and freshness of `data/venue-registry.json`. The registry is currently maintained manually via `add_venue_registry_strict.py`. Ticketmaster ingestion and the daily 6 AM PT scraper both perform well; the constraint is discovery, not ingestion.

SVDA is a Claude Managed Agent. The agent config and cloud environment are persistent Anthropic API resources. Each weekly run creates a new session that mounts the GitHub repo, researches venue sources, writes a candidate JSON sidecar, appends high-confidence proposed registry rows on a new branch, and opens a PR for human review.

Managed Agents do not provide the weekly schedule directly in the current public quickstart. Scheduling is handled by GitHub Actions, which calls the Managed Agents API. The actual tool execution still happens in Anthropic-managed cloud containers, not on Arjun's laptop.

## 2. Goals

- G1. Surface 5-10 net new validated Bay Area venues per month, with monthly precision at least 40% (PR rows merged / PR rows proposed).
- G2. Run weekly with zero laptop dependency. Survives laptop closed, Wi-Fi drops, travel.
- G3. Cost per merged venue under $2 in Anthropic API spend.
- G4. Human gate on every merge via the PR review surface; the agent never lands writes directly to `main`.
- G5. Disposable: if precision is below 20% after 3 runs, delete or archive the Managed Agent resources and remove the in-repo SVDA artifacts.

## 3. Non-goals

- Not replacing or augmenting `TicketmasterClient.js` or `VenueScraperClient.js`.
- Not introducing a moderation UI or backend endpoint in this phase.
- Not running the discovery loop locally.
- Not scraping events for production ingestion. Agent only validates that events are extractable.
- Not multi-theme. Phase 1 hardcodes the Desi discovery theme in the agent prompt.
- Not auto-merging PRs. Human merge only.

## 4. Architecture

```
GitHub Actions schedule / workflow_dispatch
        |
        v
scripts/svda/run_managed_agent.py
        |
        | 1. Reuse or create Anthropic Agent: svda-weekly-managed
        | 2. Reuse or create Anthropic Environment: svda-weekly-cloud
        | 3. Create Session with GitHub repo resource mounted
        | 4. Send SVDA user task and stream events until idle
        v
Claude Managed Agents session in Anthropic cloud container
        |
        | - Reads docs/svda/PROMPT.md
        | - Reads .claude/skills/venue-discovery/SKILL.md
        | - Reads data/venue-registry.json and categoryMapping.js
        | - Uses web_search and web_fetch for candidate discovery
        | - Uses file/bash/git/GitHub MCP tools for validation and PR work
        v
GitHub PR from claude/svda-YYYY-MM-DD
        |
        v
Human review, edit, merge, or close
```

Two artifacts the agent produces every run:

1. `data/venue-candidates/YYYY-MM-DD_candidates.json`: full proposal record with rejections, costs, and run evidence.
2. Direct edit to `data/venue-registry.json`: only high-confidence proposed registry rows, appended in registry format on the PR branch.

## 5. Tech stack

- Runtime: Claude Managed Agents API with `agent_toolset_20260401`.
- Environment: Anthropic-managed cloud container.
- Repo integration: GitHub repository session resource mounted at `/workspace/curate-my-world`.
- PR tooling: GitHub MCP server plus the mounted repo.
- Scheduler: GitHub Actions cron, plus `workflow_dispatch` for manual smoke tests.
- Model: `claude-sonnet-4-6` by default, overrideable via `SVDA_AGENT_MODEL`.
- In-repo dependencies: existing Python `requests`; no new runtime package required.
- Secrets: GitHub Actions provides `github.token`; `ANTHROPIC_API_KEY` must be configured as a repository secret.

## 6. File structure

```
curate-my-world/
├── .github/
│   └── workflows/
│       └── svda-managed-agent.yml                  # weekly and manual trigger
├── .claude/
│   └── skills/
│       └── venue-discovery/
│           └── SKILL.md                            # operational knowledge for the agent
├── data/
│   ├── venue-registry.json                         # existing; agent appends on PR branch
│   └── venue-candidates/
│       ├── README.md
│       └── schema.json
├── docs/
│   └── svda/
│       ├── MANAGED_AGENT_CONFIG.md                 # Anthropic/GitHub config
│       ├── PROMPT.md                               # exact session task prompt
│       └── EVAL_LOG.md
└── scripts/
    └── svda/
        └── run_managed_agent.py                    # Managed Agents API runner
```

## 7. Data contracts

### Input: `data/venue-registry.json`

Read by the agent at the start of each session. Used for dedup. Agent appends proposed registry rows here on the PR branch only, matching the existing schema.

### Output A: `data/venue-candidates/YYYY-MM-DD_candidates.json`

Required top-level fields:

- `schema_version`
- `run_date`
- `run_id`
- `managed_agent_session_url`
- `category_targeted`
- `geographic_scope`
- `agent_model`
- `total_cost_usd`
- `session_duration_minutes`
- `candidates_proposed`
- `candidates_rejected`

Each proposed candidate records discovery evidence, sample future events, dedup status, scores, and `registry_row_proposed`.

Closed rejection reasons: `no_structured_events`, `geographic_mismatch`, `category_mismatch`, `duplicate_existing`, `dead_site`, `extraction_failed`, `low_event_volume`.

### Output B: append to `data/venue-registry.json`

Agent appends only rows where `registry_row_proposed: true`. Schema match against the existing registry is mandatory.

## 8. Managed Agent configuration

See `docs/svda/MANAGED_AGENT_CONFIG.md`.

Key values:

- Agent name: `svda-weekly-managed`
- Environment name: `svda-weekly-cloud`
- Repo URL: `https://github.com/ArjunDivecha/curate-my-world`
- Mount path: `/workspace/curate-my-world`
- Branch prefix: `claude/svda-`
- GitHub MCP URL: `https://api.githubcopilot.com/mcp/`
- Beta header: `managed-agents-2026-04-01`
- Tool permissions: `always_allow` for the agent toolset and GitHub MCP toolset, because the workflow is non-interactive.

## 9. Session task prompt

Stored at `docs/svda/PROMPT.md`. The GitHub Actions runner sends this prompt to each new session, along with the run date and repo mount path.

The persistent agent system prompt stays short and stable. Run-specific details live in the user message and versioned repo docs so behavior can be changed by PR.

## 10. Discovery theme selection for Phase 1

Phase 1 ships with the Desi discovery theme hardcoded. Rationale: Arjun has ground truth, Ticketmaster has weak coverage, and marginal value is highest.

Registry rows should use canonical category keys from `curate-events-api/src/utils/categoryMapping.js`. In the current codebase, South Asian diaspora sources map to `desi`.

After 4 successful runs with precision at least 0.40, add `Lectures` and `Tech`.

## 11. Implementation tasks

| # | Task | Where |
|---|---|---|
| 1 | Create `.claude/skills/venue-discovery/SKILL.md` | Repo |
| 2 | Create `data/venue-candidates/schema.json` | Repo |
| 3 | Create `data/venue-candidates/README.md` | Repo |
| 4 | Create `docs/svda/PROMPT.md` | Repo |
| 5 | Create `docs/svda/MANAGED_AGENT_CONFIG.md` | Repo |
| 6 | Create `docs/svda/EVAL_LOG.md` | Repo |
| 7 | Create `scripts/svda/run_managed_agent.py` | Repo |
| 8 | Create `.github/workflows/svda-managed-agent.yml` | Repo |
| 9 | Commit on feature branch, open PR, merge after review | GitHub |
| 10 | Add `ANTHROPIC_API_KEY` repo secret | GitHub |
| 11 | Run workflow manually for smoke test | GitHub Actions |
| 12 | Inspect Managed Agents session transcript and resulting PR | Anthropic/GitHub |
| 13 | Enable weekly schedule by leaving workflow active on `main` | GitHub Actions |

## 12. Acceptance criteria

Phase 1 ships when all are true:

- [ ] Repo artifacts are committed to `main`.
- [ ] GitHub repository secret `ANTHROPIC_API_KEY` is configured.
- [ ] Manual `workflow_dispatch` smoke test starts a real Managed Agents session.
- [ ] The session opens a PR from a `claude/svda-*` branch.
- [ ] Smoke test PR contains `data/venue-candidates/YYYY-MM-DD_candidates.json`.
- [ ] Smoke test PR contains zero or more proposed `data/venue-registry.json` rows.
- [ ] Smoke test JSON validates against `data/venue-candidates/schema.json`.
- [ ] Proposed candidates have fetched URLs and at least one sample future event.
- [ ] Dedup against existing registry flags obvious duplicates correctly.
- [ ] Total smoke-test session cost is 2.50 USD or lower.
- [ ] Branch protection prevents direct writes to `main`.
- [ ] Managed Agents session transcript is inspected for task-level network, tool, validation, and branch-permission failures.

## 13. Risks and mitigations

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Agent pushes bad data to `main` | Low | Critical | GitHub branch protection; prompt requires `claude/svda-*`; workflow token limited to repo. |
| Hallucinated venues in PR | Medium | High | Candidate must have fetched URL and real future sample events. |
| Geographic drift | Medium | Medium | Strict allowlist in skill; manual spot-check first 3 runs. |
| Schema drift on registry append | Medium | High | Agent reads registry shape; JSON schema validates sidecar; PR diff is human-reviewed. |
| Cost overrun | Low | Low | Prompt-level 3 USD cap; session usage inspected after run. |
| GitHub MCP pauses for confirmation | Medium | Medium | Configure `mcp_toolset` permission policy as `always_allow`; runner fails if the session stops for required action. |
| Network restrictions block git or MCP | Medium | Medium | Environment allows GitHub hosts and MCP servers; web tools are independent of container networking. |
| Green session status masks task failure | Medium | Medium | Acceptance requires transcript inspection and PR artifact validation. |
| Agent/environment duplicate resources | Medium | Low | Runner lists by name and reuses existing resources before creating. |

## 14. Eval / kill criteria

Append one row to `docs/svda/EVAL_LOG.md` after each PR review:

```
| Date | Proposed | Registry Proposed | Merged | Precision | Cost | Notes |
|------|----------|-------------------|--------|-----------|------|-------|
| 2026-06-07 | 9 | 6 | 4 | 0.67 | $1.83 | One geo miss; update skill examples |
```

Precision = merged / registry rows proposed. Yield = merged per run. Cost-per-merge = run cost / merged.

Kill condition: precision below 0.20 averaged over runs 1-3.

Tear-down:

1. Archive or delete the Managed Agent and cloud environment in Anthropic Console or via API.
2. Disable/delete `.github/workflows/svda-managed-agent.yml`.
3. PR to delete `.claude/skills/venue-discovery/`, `docs/svda/`, and `scripts/svda/`.
4. Keep `data/venue-candidates/` history as audit trail.

Expansion condition: precision at least 0.40 averaged over runs 1-4.

Then:

1. Add `Lectures` and `Tech` discovery themes to the skill.
2. Rotate discovery themes run-over-run or select categories from live refresh-status gaps.
3. Consider adding Managed Agents outcomes for independent run grading.
4. Consider a manual API/webhook trigger outside GitHub Actions if needed.

## 15. Open questions for Arjun

1. Confirm GitHub branch protection on `main`.
2. Confirm whether the built-in `github.token` is acceptable to pass to Anthropic Managed Agents, or whether to use a fine-grained `SVDA_GITHUB_TOKEN` secret instead.
3. Confirm Desi definition in `SKILL.md`; this is the largest quality lever.
4. Confirm whether Sunday 22:00 local time should be exact across DST. GitHub Actions cron is UTC-only, so exact local wall-clock scheduling would need a different scheduler or a small timezone gate in the workflow.

---

**End of PRD v2.2.**
