/**
 * Venue cache persistence helpers (Postgres).
 *
 * Goal: make venue scraper cache durable in cloud (Railway) by persisting the
 * cache blob to Postgres. This keeps runtime behavior stable even if the app
 * restarts/redeploys (filesystem cache is ephemeral in containers).
 */

import { createLogger } from './logger.js';

const logger = createLogger('VenueCacheDb');

const CACHE_ROW_ID = 'default';
const SCRAPE_LOCK_KEY = 923_442_911; // arbitrary constant for pg advisory lock

let poolPromise = null;
let schemaEnsuredPromise = null;
let scrapeLockClient = null;

async function getPool() {
  if (poolPromise) return poolPromise;

  poolPromise = (async () => {
    const DATABASE_URL = process.env.DATABASE_URL || '';
    if (!DATABASE_URL) return null;

    let PoolCtor;
    try {
      ({ Pool: PoolCtor } = await import('pg'));
    } catch (error) {
      logger.warn('pg package is unavailable; venue cache DB mode disabled', { error: error.message });
      return null;
    }

    try {
      return new PoolCtor({ connectionString: DATABASE_URL });
    } catch (error) {
      logger.warn('Failed to create pg pool; venue cache DB mode disabled', { error: error.message });
      return null;
    }
  })();

  return poolPromise;
}

async function ensureSchema(pool) {
  if (schemaEnsuredPromise) return schemaEnsuredPromise;

  schemaEnsuredPromise = (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS venue_events_cache (
          id TEXT PRIMARY KEY,
          cache JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS venue_scrape_runs (
          id BIGSERIAL PRIMARY KEY,
          status TEXT NOT NULL,
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ,
          error TEXT,
          venues_total INTEGER,
          venues_success INTEGER,
          venues_failed INTEGER,
          venues_skipped INTEGER,
          events_total INTEGER,
          cache_last_updated TIMESTAMPTZ
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS venue_scrape_runs_started_at_idx
          ON venue_scrape_runs (started_at DESC)
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS all_categories_response_cache (
          id TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS daily_update_runs (
          id BIGSERIAL PRIMARY KEY,
          status TEXT NOT NULL,
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ,
          error TEXT,
          summary JSONB,
          report_markdown TEXT,
          report_path TEXT
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS daily_update_runs_started_at_idx
          ON daily_update_runs (started_at DESC)
      `);

      return true;
    } catch (error) {
      logger.warn('Failed to ensure venue cache DB schema; DB mode disabled', { error: error.message });
      return false;
    }
  })();

  const ok = await schemaEnsuredPromise;
  if (!ok) {
    // Allow retry later (DB could be temporarily unavailable at startup).
    schemaEnsuredPromise = null;
  }
  return ok;
}

export async function isVenueCacheDbAvailable() {
  const pool = await getPool();
  if (!pool) return false;
  const ok = await ensureSchema(pool);
  return !!ok;
}

export async function readVenueCacheFromDb() {
  const pool = await getPool();
  if (!pool) return null;
  const ok = await ensureSchema(pool);
  if (!ok) return null;

  try {
    const result = await pool.query(
      `SELECT cache, updated_at FROM venue_events_cache WHERE id = $1`,
      [CACHE_ROW_ID]
    );
    if (!result.rows?.length) return null;
    return result.rows[0]?.cache || null;
  } catch (error) {
    logger.warn('Failed to read venue cache from DB', { error: error.message });
    return null;
  }
}

export async function upsertVenueCacheToDb(cache) {
  const pool = await getPool();
  if (!pool) return false;
  const ok = await ensureSchema(pool);
  if (!ok) return false;

  try {
    await pool.query(
      `
      INSERT INTO venue_events_cache (id, cache, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (id) DO UPDATE SET cache = EXCLUDED.cache, updated_at = NOW()
      `,
      [CACHE_ROW_ID, cache]
    );
    return true;
  } catch (error) {
    logger.warn('Failed to upsert venue cache to DB', { error: error.message });
    return false;
  }
}

export async function insertVenueScrapeRun() {
  const pool = await getPool();
  if (!pool) return null;
  const ok = await ensureSchema(pool);
  if (!ok) return null;

  try {
    const result = await pool.query(
      `INSERT INTO venue_scrape_runs (status, started_at) VALUES ('running', NOW()) RETURNING id`,
    );
    return result.rows?.[0]?.id ?? null;
  } catch (error) {
    logger.warn('Failed to insert venue scrape run', { error: error.message });
    return null;
  }
}

export async function completeVenueScrapeRun(runId, { status, error, stats, cacheLastUpdated } = {}) {
  const pool = await getPool();
  if (!pool) return false;
  const ok = await ensureSchema(pool);
  if (!ok) return false;
  if (!runId) return false;

  const safeStatus = status || 'success';
  const safeError = error || null;
  const s = stats || {};

  try {
    await pool.query(
      `
      UPDATE venue_scrape_runs
      SET
        status = $2,
        completed_at = NOW(),
        error = $3,
        venues_total = $4,
        venues_success = $5,
        venues_failed = $6,
        venues_skipped = $7,
        events_total = $8,
        cache_last_updated = $9
      WHERE id = $1
      `,
      [
        runId,
        safeStatus,
        safeError,
        s.totalVenues ?? null,
        s.success ?? null,
        s.failed ?? null,
        s.skipped ?? null,
        s.totalEvents ?? null,
        cacheLastUpdated ? new Date(cacheLastUpdated) : null
      ]
    );
    return true;
  } catch (error2) {
    logger.warn('Failed to complete venue scrape run', { error: error2.message });
    return false;
  }
}

export async function getLatestVenueScrapeRun() {
  const pool = await getPool();
  if (!pool) return null;
  const ok = await ensureSchema(pool);
  if (!ok) return null;

  try {
    const result = await pool.query(
      `
      SELECT id, status, started_at, completed_at, error
      FROM venue_scrape_runs
      ORDER BY started_at DESC
      LIMIT 1
      `
    );
    if (!result.rows?.length) return null;
    return result.rows[0] || null;
  } catch (error) {
    logger.warn('Failed to query latest venue scrape run', { error: error.message });
    return null;
  }
}

export async function tryAcquireVenueScrapeLock() {
  const pool = await getPool();
  if (!pool) return { ok: false, reason: 'no_pool' };
  const ok = await ensureSchema(pool);
  if (!ok) return { ok: false, reason: 'schema' };
  if (scrapeLockClient) return { ok: false, reason: 'locked' };

  let client = null;
  try {
    client = await pool.connect();
    const result = await client.query(`SELECT pg_try_advisory_lock($1) AS locked`, [SCRAPE_LOCK_KEY]);
    const locked = !!result.rows?.[0]?.locked;
    if (!locked) {
      client.release();
      return { ok: false, reason: 'locked' };
    }
    scrapeLockClient = client;
    return { ok: true };
  } catch (error) {
    if (client && !scrapeLockClient) {
      try { client.release(); } catch {}
    }
    if (scrapeLockClient) {
      try { scrapeLockClient.release(); } catch {}
      scrapeLockClient = null;
    }
    logger.warn('Failed to acquire venue scrape lock', { error: error.message });
    return { ok: false, reason: 'error' };
  }
}

export async function releaseVenueScrapeLock() {
  if (!scrapeLockClient) return false;

  try {
    await scrapeLockClient.query(`SELECT pg_advisory_unlock($1)`, [SCRAPE_LOCK_KEY]);
    scrapeLockClient.release();
    scrapeLockClient = null;
    return true;
  } catch (error) {
    try { scrapeLockClient.release(); } catch {}
    scrapeLockClient = null;
    logger.warn('Failed to release venue scrape lock', { error: error.message });
    return false;
  }
}

export async function insertDailyUpdateRun() {
  const pool = await getPool();
  if (!pool) return null;
  const ok = await ensureSchema(pool);
  if (!ok) return null;

  try {
    const result = await pool.query(
      `INSERT INTO daily_update_runs (status, started_at) VALUES ('running', NOW()) RETURNING id`
    );
    return result.rows?.[0]?.id ?? null;
  } catch (error) {
    logger.warn('Failed to insert daily update run', { error: error.message });
    return null;
  }
}

export async function completeDailyUpdateRun(runId, { status, error, summary, reportMarkdown, reportPath } = {}) {
  const pool = await getPool();
  if (!pool) return false;
  const ok = await ensureSchema(pool);
  if (!ok) return false;
  if (!runId) return false;

  try {
    await pool.query(
      `
      UPDATE daily_update_runs
      SET
        status = $2,
        completed_at = NOW(),
        error = $3,
        summary = $4,
        report_markdown = $5,
        report_path = $6
      WHERE id = $1
      `,
      [runId, status || 'success', error || null, summary || null, reportMarkdown || null, reportPath || null]
    );
    return true;
  } catch (error2) {
    logger.warn('Failed to complete daily update run', { error: error2.message });
    return false;
  }
}

export async function getLatestDailyUpdateRun() {
  const pool = await getPool();
  if (!pool) return null;
  const ok = await ensureSchema(pool);
  if (!ok) return null;

  try {
    const result = await pool.query(
      `
      SELECT id, status, started_at, completed_at, error, summary, report_path
      FROM daily_update_runs
      ORDER BY started_at DESC
      LIMIT 1
      `
    );
    if (!result.rows?.length) return null;
    return result.rows[0] || null;
  } catch (error) {
    logger.warn('Failed to query latest daily update run', { error: error.message });
    return null;
  }
}

// ---------------------------------------------------------------------------
// All-categories response cache (Postgres-backed, survives restarts/deploys)
// ---------------------------------------------------------------------------

export async function readAllCategoriesCache(requestKey) {
  const pool = await getPool();
  if (!pool) return null;
  const ok = await ensureSchema(pool);
  if (!ok) return null;

  try {
    const result = await pool.query(
      `SELECT payload, updated_at FROM all_categories_response_cache WHERE id = $1`,
      [requestKey]
    );
    if (!result.rows?.length) return null;
    const row = result.rows[0];
    return { payload: row.payload, updatedAt: new Date(row.updated_at).getTime() };
  } catch (error) {
    logger.warn('Failed to read all-categories cache from DB', { error: error.message });
    return null;
  }
}

export async function writeAllCategoriesCache(requestKey, payload) {
  const pool = await getPool();
  if (!pool) return false;
  const ok = await ensureSchema(pool);
  if (!ok) return false;

  try {
    await pool.query(
      `
      INSERT INTO all_categories_response_cache (id, payload, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
      `,
      [requestKey, payload]
    );
    return true;
  } catch (error) {
    logger.warn('Failed to write all-categories cache to DB', { error: error.message });
    return false;
  }
}
