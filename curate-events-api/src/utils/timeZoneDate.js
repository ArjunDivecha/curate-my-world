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
