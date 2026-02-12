/**
 * Daily venue scrape scheduler (6:00am America/Los_Angeles).
 *
 * This runs inside the API process and spawns the existing scraper script as a
 * detached child process that writes results to Postgres (`--write-db`).
 *
 * It is a pragmatic alternative to configuring a separate Railway cron/worker.
 * The scraper itself uses a Postgres advisory lock, so even if multiple app
 * instances exist, only one scrape will run at a time.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { createLogger } from './logger.js';

const logger = createLogger('VenueRefreshScheduler');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_TIMEZONE = 'America/Los_Angeles';
const DEFAULT_HOUR = 6;
const DEFAULT_MINUTE = 0;

const SCRAPER_SCRIPT = path.resolve(__dirname, '../../scripts/scrape-venues.js');

function parseBooleanEnv(value, { defaultValue } = {}) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on', 'enabled', 'enable'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off', 'disabled', 'disable'].includes(normalized)) return false;
  return defaultValue;
}

function getZonedParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type === 'literal') continue;
    map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

// Returns offsetMs such that: utcMs + offsetMs => "same wall clock" in timeZone.
function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getZonedParts(date, timeZone);
  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUTC - date.getTime();
}

function zonedTimeToUtcMs({ year, month, day, hour, minute, second }, timeZone) {
  // Two-pass offset adjust (safe for 6am; avoids DST transition ambiguity).
  const wallClockAsUTC = Date.UTC(year, month - 1, day, hour, minute, second);
  let offset = getTimeZoneOffsetMs(new Date(wallClockAsUTC), timeZone);
  let utc = wallClockAsUTC - offset;
  offset = getTimeZoneOffsetMs(new Date(utc), timeZone);
  utc = wallClockAsUTC - offset;
  return utc;
}

function getNextRunTimestampMs({ timeZone, hour, minute }) {
  const now = new Date();
  const zonedNow = getZonedParts(now, timeZone);

  let target = {
    year: zonedNow.year,
    month: zonedNow.month,
    day: zonedNow.day,
    hour,
    minute,
    second: 0,
  };

  // If we've already passed today's scheduled time in the target time zone, schedule tomorrow.
  const passedToday =
    zonedNow.hour > hour ||
    (zonedNow.hour === hour && (
      zonedNow.minute > minute ||
      (zonedNow.minute === minute && (zonedNow.second || 0) > 0)
    ));
  if (passedToday) {
    const tomorrowUTC = zonedTimeToUtcMs(
      { ...target, day: target.day + 1 },
      timeZone
    );
    return tomorrowUTC;
  }

  return zonedTimeToUtcMs(target, timeZone);
}

function spawnVenueScrape() {
  try {
    const child = spawn('node', [SCRAPER_SCRIPT, '--write-db'], {
      stdio: 'ignore',
      detached: true,
      env: { ...process.env }
    });
    child.unref();
    logger.info('Scheduled venue scrape triggered', { script: SCRAPER_SCRIPT });
  } catch (error) {
    logger.error('Failed to spawn scheduled venue scrape', { error: error.message });
  }
}

export function startVenueRefreshScheduler() {
  const hasDatabaseUrl = !!process.env.DATABASE_URL;
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const defaultEnabled = (process.env.NODE_ENV === 'production' && hasDatabaseUrl && hasAnthropicKey);
  const enabled = parseBooleanEnv(process.env.VENUE_DAILY_REFRESH_ENABLED, {
    // Default: enabled in production only when DB + Anthropic key exist.
    defaultValue: defaultEnabled,
  });

  if (!enabled) {
    logger.info('Daily venue refresh scheduler disabled', {
      nodeEnv: process.env.NODE_ENV || null,
      explicitEnv: process.env.VENUE_DAILY_REFRESH_ENABLED ?? null,
      defaultEnabled,
      hasDatabaseUrl,
      hasAnthropicKey
    });
    return;
  }

  const timeZone = (process.env.VENUE_DAILY_REFRESH_TIMEZONE || DEFAULT_TIMEZONE).trim();
  const hour = Number(process.env.VENUE_DAILY_REFRESH_HOUR ?? DEFAULT_HOUR);
  const minute = Number(process.env.VENUE_DAILY_REFRESH_MINUTE ?? DEFAULT_MINUTE);

  if (!Number.isFinite(hour) || hour < 0 || hour > 23 || !Number.isFinite(minute) || minute < 0 || minute > 59) {
    logger.warn('Invalid daily refresh schedule; scheduler disabled', { hour, minute, timeZone });
    return;
  }

  const scheduleNext = () => {
    const nextMs = getNextRunTimestampMs({ timeZone, hour, minute });
    const delayMs = Math.max(0, nextMs - Date.now());

    logger.info('Next daily venue scrape scheduled', {
      timeZone,
      hour,
      minute,
      nextRunUtc: new Date(nextMs).toISOString(),
      delayMinutes: Math.round(delayMs / 60000),
    });

    setTimeout(() => {
      spawnVenueScrape();
      scheduleNext();
    }, delayMs);
  };

  scheduleNext();
}
