# Daily Update Pipeline Rebuild Plan

Date: 2026-02-12  
Branch: `codex/daily-update-pipeline-rewrite`

## 1. Target Behavior (what we are building)

1. Run one orchestrated daily update at **6:00 AM America/Los_Angeles**.
2. Build a fresh venue snapshot in DB.
3. Retry failed venue scrapes automatically (bounded attempts) before finalizing the day.
4. Rebuild all-categories DB cache only after venue snapshot is finalized.
5. Serve DB cache all day (no accidental write-on-read updates).
6. Produce a plain-English daily report with status, failures, and next actions.

## 2. Problems in Current System (why it is failing)

1. Two independent 6:00 AM schedulers race each other (`venueRefreshScheduler` and all-categories scheduler in `events.js`).
2. Advisory lock is not session-pinned (uses `pool.query`), so lock reliability is weak.
3. Partial runs can write global cache blob and can overwrite DB with incomplete state.
4. Scheduler edge case at exact second can repeatedly trigger (`delayMs=0` loop).
5. Recurring event dedupe (ICS/Tribe) can collapse valid future occurrences.
6. Status/freshness semantics overstate freshness (`lastScraped` advanced even when data preserved from old run).
7. No first-class daily report artifact.

## 3. New Architecture

### 3.1 Single daily orchestrator

Create a single orchestrator entrypoint:
- `curate-events-api/scripts/run-daily-update.js`

Execution sequence:
1. Acquire global run lock (DB advisory lock, pinned client).
2. Run full venue scrape (`scrape-venues.js --write-db --run-type=daily_full`).
3. Retry failures up to N times (`--retry-failed --write-db --allow-partial-db-write --run-type=daily_retry`).
4. Rebuild all-categories cache for default request key after venue retries finish.
5. Generate and persist daily plain-English report (file + DB metadata row).
6. Mark orchestrator run complete with explicit status.

### 3.2 Scheduler owns only orchestration trigger

Keep one scheduler in API runtime:
- `startVenueRefreshScheduler()` schedules only the orchestrator script.
- Remove autonomous all-categories 6:00 scheduler from `events.js`.
- All-categories refresh becomes orchestrator-driven for daily updates.

### 3.3 Read path

- `/api/events/all-categories` remains DB-cache-first.
- Request-time `refresh=true` remains opt-in manual trigger only.
- No background write-on-read by default.

## 4. File-by-File Change Plan

### 4.1 `curate-events-api/src/utils/venueCacheDb.js`

1. Fix advisory lock correctness:
   - Hold dedicated lock client via `pool.connect()`.
   - Use that same client for lock and unlock.
   - Release client on unlock and on error paths.
2. Add run-report persistence primitives:
   - New table `daily_update_runs`.
   - New table `daily_update_reports` (or JSON report column on runs table).
   - Helpers: `insertDailyUpdateRun`, `completeDailyUpdateRun`, `writeDailyUpdateReport`, `getLatestDailyUpdateRun`.
3. Keep existing cache tables and scrape run table intact.

### 4.2 `curate-events-api/scripts/scrape-venues.js`

1. Add explicit run semantics:
   - `--run-type=daily_full|daily_retry|manual_full|manual_partial`
2. Protect DB from unsafe partial writes:
   - Partial writes to DB disabled by default.
   - Enable only when `--allow-partial-db-write` is passed.
3. Load baseline cache from DB in DB mode before file fallback.
4. Improve failure metadata:
   - Add `dataFreshAt` (timestamp when events were actually refreshed successfully).
   - Keep `lastAttemptedAt` separate from data freshness.
5. ICS/Tribe dedupe fix:
   - Dedupe key should retain recurring occurrences (`title + startDate`), not canonicalized URL-only collapse.
6. Keep empty/error preservation behavior but do not imply fresh data.

### 4.3 `curate-events-api/src/routes/events.js`

1. Remove module-level `startAllCategoriesRefreshScheduler()` side effect.
2. Keep manual `refresh=true` endpoint behavior.
3. Move default all-categories refresh builder into callable utility function (shared with orchestrator).

### 4.4 New utility: `curate-events-api/src/utils/allCategoriesRefresh.js`

1. Export deterministic default request key builder (same params as frontend default).
2. Export refresh function used by:
   - API manual refresh path
   - daily orchestrator
3. Ensure one refresh in-flight guard where needed.

### 4.5 `curate-events-api/src/utils/venueRefreshScheduler.js`

1. Fix schedule edge at exact target second:
   - If `nextMs <= now`, schedule tomorrow explicitly.
2. Spawn orchestrator script (not raw scraper).
3. Add child `exit`/`error` logging for success/failure visibility.
4. Keep 6:00 AM PT default, env-overridable.

### 4.6 New script: `curate-events-api/scripts/run-daily-update.js`

Responsibilities:
1. Start run record.
2. Execute full scrape subprocess.
3. Determine failed venues after each attempt from cache status.
4. Retry with bounded attempts and optional backoff.
5. Trigger all-categories refresh after venue phase success/partial success.
6. Build plain-English report and write:
   - file: `data/reports/daily-update-YYYY-MM-DD.md`
   - DB report row for API/health visibility.
7. Finalize run status:
   - `success` / `partial_success` / `failed`.

### 4.7 `curate-events-api/server.js`

1. Keep only venue scheduler startup.
2. No second scheduler startup from events route import side effects after refactor.

## 5. Retry Policy (explicit)

1. Retry candidates: venues with `status=error` after full run.
2. Optional retry candidates: `empty_page` when previous data existed (config toggle).
3. Max attempts: default 2 retries after initial full run (total attempts max 3).
4. Backoff: linear 2 min between retry passes (configurable).
5. Stop early if failed venue count reaches 0.
6. Retries are patch runs over latest DB baseline and do not bump global freshness timestamp unless explicitly configured.

## 6. Daily Plain-English Report

Report sections:
1. Run window (Pacific + UTC timestamps).
2. Overall status (`success`, `partial_success`, `failed`).
3. Venue coverage numbers:
   - total venues targeted
   - success/failed/skipped
   - retry attempts performed
   - net improvement from retries
4. Event volume:
   - total events in finalized venue cache
   - delta vs previous day
5. All-categories cache status:
   - refreshed or not
   - total categories and total events
6. Top failures with reason and recommended action.
7. “What will be better today” bullet list.

Output files:
- `curate-events-api/data/reports/daily-update-YYYY-MM-DD.md`
- `curate-events-api/data/reports/daily-update-YYYY-MM-DD.json`

## 7. Configuration Additions

1. `DAILY_UPDATE_RETRY_ATTEMPTS` (default `2`)
2. `DAILY_UPDATE_RETRY_BACKOFF_MS` (default `120000`)
3. `DAILY_UPDATE_ENABLE_EMPTY_PAGE_RETRY` (default `false`)
4. `DAILY_UPDATE_REPORT_DIR` (default `curate-events-api/data/reports`)
5. `ALL_CATEGORIES_DAILY_REFRESH_ENABLED` (default `false`; orchestrator-driven)

## 8. Rollout Sequence

1. Ship lock fix + scheduler race removal first.
2. Ship orchestrator and retry loop second.
3. Ship report generation and DB reporting third.
4. Run one manual full cycle in staging.
5. Confirm logs/DB/report outputs.
6. Promote to production before next 6:00 AM PT window.

## 9. Validation Plan (must pass)

1. Lock test:
   - Run two orchestrators simultaneously.
   - Expect one to exit due to lock.
2. Scheduler test:
   - Start server near target second and verify single trigger.
3. Race test:
   - Verify all-categories refresh starts only after scrape phase completion.
4. Partial-write safety test:
   - Manual `--domain` run without override must not write global DB cache.
5. Retry effectiveness test:
   - Inject known failing domains, verify retries execute and reduce fail count when possible.
6. Report test:
   - Confirm markdown/json reports generated and human-readable.
7. Read-path test:
   - `/api/events/all-categories` serves DB snapshot and does not trigger unintended live refresh.

## 10. Risks + Mitigations

1. Risk: refactor of all-categories refresh may break endpoint behavior.
   - Mitigation: keep response schema unchanged and reuse existing internals.
2. Risk: DB unavailable during daily run.
   - Mitigation: run marks failed persistence explicitly; report calls this out; file report still written.
3. Risk: retry loop increases run duration.
   - Mitigation: bounded attempts and backoff caps.
4. Risk: new tables increase migration complexity.
   - Mitigation: use idempotent `CREATE TABLE IF NOT EXISTS` in existing schema bootstrap path.

## 11. Definition of Done

1. Exactly one daily orchestrated run at 6:00 AM PT.
2. No stale all-categories snapshot race.
3. Safe locking and no concurrent destructive writes.
4. Failed venues retried automatically with bounded policy.
5. Daily plain-English report generated with actionable status.
6. Manual partial runs cannot silently corrupt global DB cache.
7. Fort Mason and other Tribe recurring event occurrences preserved correctly.
