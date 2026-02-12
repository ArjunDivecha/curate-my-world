import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import {
  completeDailyUpdateRun,
  insertDailyUpdateRun,
  readVenueCacheFromDb,
} from '../src/utils/venueCacheDb.js';
import { refreshDefaultAllCategoriesCache } from '../src/routes/events.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
try {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
} catch {}

const SCRAPER_SCRIPT = path.resolve(__dirname, './scrape-venues.js');
const ROOT_DATA_DIR = path.resolve(__dirname, '../../data');
const FILE_CACHE_PATH = path.join(ROOT_DATA_DIR, 'venue-events-cache.json');
const REPORT_DIR = process.env.DAILY_UPDATE_REPORT_DIR
  ? path.resolve(process.env.DAILY_UPDATE_REPORT_DIR)
  : path.resolve(__dirname, '../data/reports');
const PACIFIC_TZ = 'America/Los_Angeles';

const RETRY_ATTEMPTS = Number.isFinite(Number(process.env.DAILY_UPDATE_RETRY_ATTEMPTS))
  ? Math.max(0, Number(process.env.DAILY_UPDATE_RETRY_ATTEMPTS))
  : 2;
const RETRY_BACKOFF_MS = Number.isFinite(Number(process.env.DAILY_UPDATE_RETRY_BACKOFF_MS))
  ? Math.max(0, Number(process.env.DAILY_UPDATE_RETRY_BACKOFF_MS))
  : 120000;
const RETRY_EMPTY_PAGE = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.DAILY_UPDATE_ENABLE_EMPTY_PAGE_RETRY || '').toLowerCase().trim()
);

function getZonedDateParts(date = new Date(), timeZone = PACIFIC_TZ) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type === 'literal') continue;
    map[part.type] = part.value;
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
  };
}

function formatPacificDateStamp(date = new Date()) {
  const parts = getZonedDateParts(date, PACIFIC_TZ);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function appendLog(logPath, message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  fs.appendFileSync(logPath, line + '\n');
  console.log(message);
}

async function runNodeScript(scriptPath, args, { logPath, label }) {
  const startedAt = new Date().toISOString();
  appendLog(logPath, `${label}: starting (${[scriptPath, ...args].join(' ')})`);

  return new Promise((resolve) => {
    const child = spawn('node', [scriptPath, ...args], {
      env: { ...process.env },
      stdio: 'inherit',
    });

    child.on('error', (error) => {
      const finishedAt = new Date().toISOString();
      appendLog(logPath, `${label}: spawn error (${error.message})`);
      resolve({
        ok: false,
        exitCode: null,
        startedAt,
        finishedAt,
        durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
        error: error.message,
      });
    });

    child.on('exit', (code) => {
      const finishedAt = new Date().toISOString();
      appendLog(logPath, `${label}: exited with code ${code}`);
      resolve({
        ok: code === 0,
        exitCode: code,
        startedAt,
        finishedAt,
        durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
      });
    });
  });
}

function loadCacheFromFile() {
  try {
    if (!fs.existsSync(FILE_CACHE_PATH)) return null;
    return JSON.parse(fs.readFileSync(FILE_CACHE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

async function loadCurrentCache() {
  const dbCache = await readVenueCacheFromDb();
  if (dbCache && typeof dbCache === 'object') return dbCache;
  return loadCacheFromFile();
}

function getRetryCandidates(cache) {
  const venues = cache?.venues || {};
  const candidates = [];

  for (const [domain, venue] of Object.entries(venues)) {
    const status = String(venue?.status || '').toLowerCase();
    const shouldRetryError = status === 'error';
    const shouldRetryEmpty = RETRY_EMPTY_PAGE && (status === 'empty_page' || status === 'empty_page_preserved');
    if (shouldRetryError || shouldRetryEmpty) {
      candidates.push({
        domain,
        venueName: venue?.venueName || domain,
        status,
        error: venue?.error || null,
      });
    }
  }

  return candidates;
}

function summarizeCache(cache) {
  const venues = cache?.venues || {};
  const values = Object.values(venues);
  const byStatus = values.reduce((acc, venue) => {
    const key = venue?.status || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    lastUpdated: cache?.lastUpdated || null,
    totalEvents: Number.isFinite(Number(cache?.totalEvents)) ? Number(cache.totalEvents) : 0,
    venueCount: values.length,
    statusCounts: byStatus,
  };
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function buildMarkdownReport({
  startedAt,
  finishedAt,
  status,
  fullRun,
  retryRuns,
  retriesBefore,
  retriesAfter,
  allCategories,
  cacheSummary,
  failures,
}) {
  const lines = [];
  lines.push('# Daily Update Report');
  lines.push('');
  lines.push(`- Status: **${status}**`);
  lines.push(`- Started (UTC): ${startedAt}`);
  lines.push(`- Finished (UTC): ${finishedAt}`);
  lines.push(`- Duration: ${formatDuration(new Date(finishedAt).getTime() - new Date(startedAt).getTime())}`);
  lines.push('');

  lines.push('## Venue Scrape');
  lines.push(`- Full run exit code: ${fullRun.exitCode}`);
  lines.push(`- Retry attempts configured: ${RETRY_ATTEMPTS}`);
  lines.push(`- Retry attempts executed: ${retryRuns.length}`);
  lines.push(`- Retry candidates before retries: ${retriesBefore}`);
  lines.push(`- Retry candidates after retries: ${retriesAfter}`);
  lines.push('');

  lines.push('## Cache Snapshot');
  lines.push(`- lastUpdated: ${cacheSummary.lastUpdated || 'null'}`);
  lines.push(`- totalEvents: ${cacheSummary.totalEvents}`);
  lines.push(`- venueCount: ${cacheSummary.venueCount}`);
  lines.push('- statusCounts:');
  for (const [key, count] of Object.entries(cacheSummary.statusCounts || {})) {
    lines.push(`  - ${key}: ${count}`);
  }
  lines.push('');

  lines.push('## All-Categories Refresh');
  lines.push(`- success: ${allCategories.success}`);
  lines.push(`- totalEvents: ${allCategories.totalEvents}`);
  lines.push(`- updatedAt: ${allCategories.updatedAt || 'null'}`);
  if (allCategories.error) {
    lines.push(`- error: ${allCategories.error}`);
  }
  lines.push('');

  lines.push('## Top Outstanding Failures');
  if (!failures.length) {
    lines.push('- None');
  } else {
    failures.slice(0, 25).forEach((failure) => {
      lines.push(`- ${failure.venueName} (${failure.domain}) - status=${failure.status}${failure.error ? ` - ${failure.error}` : ''}`);
    });
  }
  lines.push('');

  lines.push('## What Improves Today');
  if (cacheSummary.totalEvents > 0) {
    lines.push('- Daily venue snapshot is refreshed and persisted for daytime reads.');
  } else {
    lines.push('- Venue snapshot still has zero events; fallback sources remain critical.');
  }
  if (retriesBefore > retriesAfter) {
    lines.push(`- Retry pass recovered ${retriesBefore - retriesAfter} previously failing venues.`);
  } else {
    lines.push('- Retry pass did not materially reduce failing venues.');
  }
  if (allCategories.success) {
    lines.push('- All-categories DB cache was rebuilt after venue updates.');
  } else {
    lines.push('- All-categories DB cache refresh failed; existing cache continues serving.');
  }

  return lines.join('\n') + '\n';
}

async function main() {
  const startedAt = new Date().toISOString();
  const dateStamp = formatPacificDateStamp();
  ensureDir(REPORT_DIR);

  const logPath = path.join(REPORT_DIR, `daily-update-${dateStamp}.log`);
  const reportJsonPath = path.join(REPORT_DIR, `daily-update-${dateStamp}.json`);
  const reportMdPath = path.join(REPORT_DIR, `daily-update-${dateStamp}.md`);
  const latestReportPath = path.join(REPORT_DIR, 'daily-update-latest.md');

  let runId = null;
  let finalStatus = 'failed';
  let finalSummary = null;
  let finalMarkdown = null;

  try {
    appendLog(logPath, `Daily update started (Pacific date ${dateStamp})`);
    runId = await insertDailyUpdateRun();

    const fullRun = await runNodeScript(SCRAPER_SCRIPT, ['--write-db', '--run-type=daily_full'], {
      logPath,
      label: 'full_scrape',
    });

    const retryRuns = [];
    let retriesBefore = 0;
    let retriesAfter = 0;

    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      const cacheBefore = await loadCurrentCache();
      const failedBefore = getRetryCandidates(cacheBefore);
      retriesBefore = attempt === 1 ? failedBefore.length : retriesBefore;

      appendLog(logPath, `retry_check_${attempt}: ${failedBefore.length} candidate venue(s)`);

      if (!failedBefore.length) {
        retriesAfter = 0;
        break;
      }

      if (attempt > 1 && RETRY_BACKOFF_MS > 0) {
        appendLog(logPath, `retry_wait_${attempt}: sleeping ${RETRY_BACKOFF_MS}ms before retry`);
        await sleep(RETRY_BACKOFF_MS);
      }

      const retryRun = await runNodeScript(
        SCRAPER_SCRIPT,
        ['--write-db', '--retry-failed', '--allow-partial-db-write', '--run-type=daily_retry'],
        { logPath, label: `retry_scrape_${attempt}` }
      );
      retryRuns.push({ attempt, ...retryRun, candidatesBefore: failedBefore.length });

      const cacheAfter = await loadCurrentCache();
      const failedAfter = getRetryCandidates(cacheAfter);
      retriesAfter = failedAfter.length;
      appendLog(logPath, `retry_result_${attempt}: ${failedAfter.length} candidate venue(s) remain`);

      if (!failedAfter.length) break;
    }

    const allCategories = await (async () => {
      try {
        const result = await refreshDefaultAllCategoriesCache({ reason: 'daily_orchestrator' });
        appendLog(logPath, `all_categories_refresh: success=${result.success} totalEvents=${result.totalEvents}`);
        return { success: !!result.success, totalEvents: result.totalEvents || 0, updatedAt: result.updatedAt || null };
      } catch (error) {
        appendLog(logPath, `all_categories_refresh: failed (${error.message})`);
        return { success: false, totalEvents: 0, updatedAt: null, error: error.message };
      }
    })();

    const finalCache = await loadCurrentCache();
    const cacheSummary = summarizeCache(finalCache);
    const failures = getRetryCandidates(finalCache);

    if (fullRun.ok && failures.length === 0 && allCategories.success) {
      finalStatus = 'success';
    } else if (cacheSummary.totalEvents > 0) {
      finalStatus = 'partial_success';
    } else {
      finalStatus = 'failed';
    }

    const finishedAt = new Date().toISOString();
    finalSummary = {
      status: finalStatus,
      startedAt,
      finishedAt,
      durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
      retryAttemptsConfigured: RETRY_ATTEMPTS,
      retryAttemptsExecuted: retryRuns.length,
      retriesBefore,
      retriesAfter: failures.length,
      fullRun,
      retryRuns,
      cacheSummary,
      allCategories,
      failureCount: failures.length,
    };

    finalMarkdown = buildMarkdownReport({
      startedAt,
      finishedAt,
      status: finalStatus,
      fullRun,
      retryRuns,
      retriesBefore,
      retriesAfter: failures.length,
      allCategories,
      cacheSummary,
      failures,
    });

    fs.writeFileSync(reportJsonPath, JSON.stringify({ ...finalSummary, failures }, null, 2));
    fs.writeFileSync(reportMdPath, finalMarkdown);
    fs.writeFileSync(latestReportPath, finalMarkdown);
    appendLog(logPath, `report_written: ${reportMdPath}`);

    if (runId) {
      await completeDailyUpdateRun(runId, {
        status: finalStatus,
        summary: finalSummary,
        reportMarkdown: finalMarkdown,
        reportPath: reportMdPath,
      });
    }

    if (finalStatus === 'failed') {
      process.exitCode = 1;
    }
  } catch (error) {
    const finishedAt = new Date().toISOString();
    appendLog(logPath, `daily_update_fatal: ${error.message}`);

    finalSummary = {
      status: 'failed',
      startedAt,
      finishedAt,
      durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
      error: error.message,
    };

    finalMarkdown = [
      '# Daily Update Report',
      '',
      '- Status: **failed**',
      `- Started (UTC): ${startedAt}`,
      `- Finished (UTC): ${finishedAt}`,
      `- Error: ${error.message}`,
      '',
      '## What to check',
      '- Verify DATABASE_URL and ANTHROPIC_API_KEY are present.',
      '- Verify scraper lock is not stuck from another process.',
      '- Check scrape logs for venue-level failures.',
      '',
    ].join('\n');

    try {
      fs.writeFileSync(reportJsonPath, JSON.stringify(finalSummary, null, 2));
      fs.writeFileSync(reportMdPath, finalMarkdown);
      fs.writeFileSync(latestReportPath, finalMarkdown);
    } catch {}

    if (runId) {
      await completeDailyUpdateRun(runId, {
        status: 'failed',
        error: error.message,
        summary: finalSummary,
        reportMarkdown: finalMarkdown,
        reportPath: reportMdPath,
      });
    }

    process.exitCode = 1;
  }
}

main()
  .then(() => {
    process.exit(process.exitCode || 0);
  })
  .catch((error) => {
    console.error('Daily update orchestrator crashed:', error);
    process.exit(1);
  });
