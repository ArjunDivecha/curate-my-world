import { createLogger } from './logger.js';

const logger = createLogger('TimeZoneDate');
const DEFAULT_EVENTS_TIME_ZONE = 'America/Los_Angeles';

export function getEventsTimeZone() {
  const configured = (process.env.EVENTS_TIME_ZONE || '').trim();
  return configured || DEFAULT_EVENTS_TIME_ZONE;
}

export function getZonedParts(date, timeZone = getEventsTimeZone()) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = dtf.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type === 'literal') continue;
    map[part.type] = part.value;
  }

  const weekdayMap = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: weekdayMap[map.weekday] ?? 0,
  };
}

export function getTimeZoneOffsetMs(date, timeZone = getEventsTimeZone()) {
  const parts = getZonedParts(date, timeZone);
  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUTC - date.getTime();
}

export function zonedTimeToUtcMs({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone = getEventsTimeZone()) {
  const wallClockAsUTC = Date.UTC(year, month - 1, day, hour, minute, second);
  let offset = getTimeZoneOffsetMs(new Date(wallClockAsUTC), timeZone);
  let utc = wallClockAsUTC - offset;
  offset = getTimeZoneOffsetMs(new Date(utc), timeZone);
  utc = wallClockAsUTC - offset;
  return utc;
}

export function getZonedDateTime({
  baseDate = new Date(),
  dayOffset = 0,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone = getEventsTimeZone(),
} = {}) {
  try {
    const parts = getZonedParts(baseDate, timeZone);
    const utcMs = zonedTimeToUtcMs(
      {
        year: parts.year,
        month: parts.month,
        day: parts.day + dayOffset,
        hour,
        minute,
        second,
      },
      timeZone
    );
    return new Date(utcMs);
  } catch (error) {
    logger.warn('Failed to derive zoned date time, falling back to local Date', {
      error: error.message,
      timeZone,
    });
    const fallback = new Date(baseDate);
    fallback.setDate(fallback.getDate() + dayOffset);
    fallback.setHours(hour, minute, second, 0);
    return fallback;
  }
}

export function getStartOfZonedDay(baseDate = new Date(), timeZone = getEventsTimeZone()) {
  return getZonedDateTime({ baseDate, dayOffset: 0, hour: 0, minute: 0, second: 0, timeZone });
}

export function getEndOfZonedDay(baseDate = new Date(), timeZone = getEventsTimeZone()) {
  const end = getZonedDateTime({ baseDate, dayOffset: 0, hour: 23, minute: 59, second: 59, timeZone });
  end.setMilliseconds(999);
  return end;
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NAIVE_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;

/**
 * Parse an event date. Strings without a UTC offset are venue-local wall-clock
 * times (the scraper emits e.g. "2026-02-09T19:00:00"), so they are interpreted
 * in the events time zone, never the server's zone (Railway runs UTC).
 * Date-only strings resolve to noon in the events time zone.
 * Strings with an explicit offset / "Z" are parsed as the instant they name.
 * @returns {Date|null}
 */
export function parseEventDate(value, timeZone = getEventsTimeZone()) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  if (typeof value === 'string') {
    const text = value.trim();
    const dateOnly = text.match(DATE_ONLY_RE);
    if (dateOnly) {
      return new Date(zonedTimeToUtcMs({
        year: Number(dateOnly[1]), month: Number(dateOnly[2]), day: Number(dateOnly[3]), hour: 12
      }, timeZone));
    }
    const naive = text.match(NAIVE_DATE_TIME_RE);
    if (naive) {
      return new Date(zonedTimeToUtcMs({
        year: Number(naive[1]), month: Number(naive[2]), day: Number(naive[3]),
        hour: Number(naive[4]), minute: Number(naive[5]), second: Number(naive[6] || 0)
      }, timeZone));
    }
  }

  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}
