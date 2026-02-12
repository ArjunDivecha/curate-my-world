export const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})(?!T)/;

export const parseEventDateLocalAware = (
  value: string | Date | null | undefined
) => {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string") {
    const match = value.match(DATE_ONLY_RE);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      // Noon local avoids date-only timezone shifts.
      return new Date(year, month - 1, day, 12, 0, 0, 0);
    }
  }
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const atLocalTime = (date: Date, hours: number, minutes = 0) => {
  const next = startOfLocalDay(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
};

export const sameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const getWeekendRange = (baseDate: Date = new Date()) => {
  const today = startOfLocalDay(baseDate);
  const weekday = today.getDay(); // 0 Sun ... 6 Sat

  let friday = new Date(today);
  if (weekday === 5 || weekday === 6 || weekday === 0) {
    // Fri/Sat/Sun => this weekend
    const shift = weekday === 5 ? 0 : weekday === 6 ? -1 : -2;
    friday = addDays(today, shift);
  } else {
    // Mon-Thu => upcoming weekend
    const daysUntilFriday = (5 - weekday + 7) % 7;
    friday = addDays(today, daysUntilFriday);
  }

  const saturday = addDays(friday, 1);
  const sunday = addDays(friday, 2);
  const monday = addDays(friday, 3);

  return {
    friday,
    saturday,
    sunday,
    windowStart: atLocalTime(friday, 17, 0),
    windowEnd: monday, // Monday 00:00
  };
};
