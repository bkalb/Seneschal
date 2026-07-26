import type { CalendarDate, CalendarDateString, CalendarConfig, CalendarSeason, IntercalaryPeriod } from "@/types/calendar";

// ─── Parsing / formatting ─────────────────────────────────────────────────────

export function parseDate(s: CalendarDateString): CalendarDate {
  const [year, month, day] = s.split("-").map(Number);
  return { year, month, day };
}

export function formatDate(d: CalendarDate): CalendarDateString {
  const y = String(d.year).padStart(4, "0");
  const m = String(d.month).padStart(2, "0");
  const day = String(d.day).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Human-readable display string for a campaign date, e.g.
 * "1247-08-12" -> "12 Harvestmoon 1247". Falls back to `Month ${m}` for an
 * out-of-range month index, matching the inline fallback used elsewhere.
 */
export function formatCampaignDate(s: CalendarDateString, config: CalendarConfig): string {
  const date = parseDate(s);
  const monthName = config.months[date.month - 1]?.name ?? `Month ${date.month}`;
  return `${date.day} ${monthName} ${date.year}`;
}

// ─── Absolute day count ───────────────────────────────────────────────────────

/**
 * Convert a CalendarDate to an absolute day count (0 = first day of year 1).
 * Intercalary days ARE counted in the day total (they exist in time), but
 * intercalary periods with outsideWeeks:true are excluded from the weekday
 * offset calculation — see computeWeekday.
 */
export function dateToAbsoluteDays(date: CalendarDate, config: CalendarConfig): number {
  const totalDaysPerYear = yearLength(config);
  let days = (date.year - 1) * totalDaysPerYear;

  for (let m = 1; m < date.month; m++) {
    days += config.months[m - 1].days;
    // Add any intercalary period that falls after this month
    for (const ic of config.intercalary) {
      if (ic.afterMonth === m) days += ic.days;
    }
  }
  days += date.day - 1;
  return days;
}

/**
 * Days in a full year including all intercalary periods.
 */
export function yearLength(config: CalendarConfig): number {
  const monthDays = config.months.reduce((sum, m) => sum + m.days, 0);
  const icDays = config.intercalary.reduce((sum, ic) => sum + ic.days, 0);
  return monthDays + icDays;
}

// ─── Weekday ──────────────────────────────────────────────────────────────────

/**
 * Returns the weekday name for a given date.
 * "outsideWeeks" intercalary days are skipped in the weekday cycle — the
 * weekday counter doesn't advance during those periods.
 */
export function computeWeekday(date: CalendarDate, config: CalendarConfig): string {
  if (config.weekdays.length === 0) return "";

  const epoch = parseDate(config.epochDate);
  const epochAbs = dateToAbsoluteDays(epoch, config);
  const dateAbs = dateToAbsoluteDays(date, config);

  // Count intercalary days that are "outside weeks" between epoch and date
  let outsideWeekDays = 0;
  const [start, end] = epochAbs <= dateAbs ? [epoch, date] : [date, epoch];
  const startAbs = dateToAbsoluteDays(start, config);
  const endAbs = dateToAbsoluteDays(end, config);

  for (const ic of config.intercalary) {
    if (!ic.outsideWeeks) continue;
    // Count how many times this intercalary period falls in [start, end)
    // An intercalary after month M starts at position: sum of months 1..M + prior ics
    // (+ the days of any earlier intercalary periods that share the same
    // afterMonth and precede this one in config order — they form one
    // contiguous combined block, same as absoluteDaysToDate/getIntercalaryDay).
    const priorSameMonthDays = config.intercalary
      .slice(0, config.intercalary.indexOf(ic))
      .filter((o) => o.afterMonth === ic.afterMonth)
      .reduce((sum, o) => sum + o.days, 0);
    const icStartInYear = daysToEndOfMonth(ic.afterMonth, config) + priorSameMonthDays;
    const yearsSpanned = end.year - start.year + 1;
    for (let yr = start.year; yr <= end.year; yr++) {
      const icAbsStart = (yr - 1) * yearLength(config) + icStartInYear;
      const icAbsEnd = icAbsStart + ic.days;
      // Overlap with [startAbs, endAbs]
      const overlapStart = Math.max(icAbsStart, startAbs);
      const overlapEnd = Math.min(icAbsEnd, endAbs);
      if (overlapEnd > overlapStart) {
        outsideWeekDays += overlapEnd - overlapStart;
      }
    }
    void yearsSpanned; // suppress unused warning
  }

  const weekDayOffset = (dateAbs - epochAbs - (epochAbs <= dateAbs ? outsideWeekDays : -outsideWeekDays));
  const idx = ((weekDayOffset % config.weekdays.length) + config.weekdays.length) % config.weekdays.length;
  return config.weekdays[idx];
}

function daysToEndOfMonth(monthIndex: number, config: CalendarConfig): number {
  let days = 0;
  for (let m = 1; m <= monthIndex; m++) {
    days += config.months[m - 1].days;
    for (const ic of config.intercalary) {
      if (ic.afterMonth === m && m < monthIndex) days += ic.days;
    }
  }
  return days;
}

// ─── Date arithmetic ──────────────────────────────────────────────────────────

/**
 * Advance a date by one day, rolling over month/year boundaries correctly.
 * Intercalary periods are treated as extra days appended after their afterMonth.
 */
export function advanceDate(current: CalendarDate, config: CalendarConfig): CalendarDate {
  const abs = dateToAbsoluteDays(current, config);
  return absoluteDaysToDate(abs + 1, config);
}

/**
 * Convert an absolute day count back to a CalendarDate.
 *
 * Intercalary days are represented as day numbers beyond the end of their
 * preceding month: the k-th day (1-based) of the combined run of intercalary
 * period(s) after month M is `{ month: M, day: monthDays(M) + k }`. This
 * keeps `dateToAbsoluteDays` and `absoluteDaysToDate` mutually inverse
 * (see the "afterMonth" prefix-sum in dateToAbsoluteDays, which already
 * treats intercalary days this way) rather than lossily clamping every
 * intercalary day to the same CalendarDate.
 */
export function absoluteDaysToDate(abs: number, config: CalendarConfig): CalendarDate {
  const yl = yearLength(config);
  const year = Math.floor(abs / yl) + 1;
  let remaining = abs % yl;

  for (let m = 1; m <= config.months.length; m++) {
    const monthDays = config.months[m - 1].days;
    if (remaining < monthDays) {
      return { year, month: m, day: remaining + 1 };
    }
    remaining -= monthDays;

    // Combined run of intercalary day(s) after this month (there may be more
    // than one period with the same afterMonth — they're treated as one
    // contiguous block of days, in config array order, matching the prefix
    // sum dateToAbsoluteDays uses).
    const icTotal = config.intercalary.reduce(
      (sum, ic) => (ic.afterMonth === m ? sum + ic.days : sum),
      0
    );
    if (remaining < icTotal) {
      return { year, month: m, day: monthDays + remaining + 1 };
    }
    remaining -= icTotal;
  }

  // Fallback: last day of year
  return { year, month: config.months.length, day: config.months[config.months.length - 1].days };
}

/**
 * Returns the intercalary period and 1-based day index within that period if
 * `date` falls inside one (i.e. `date.day` extends past the end of its
 * month), else null.
 */
export function getIntercalaryDay(
  date: CalendarDate,
  config: CalendarConfig
): { period: IntercalaryPeriod; dayIndex: number } | null {
  const month = config.months[date.month - 1];
  if (!month) return null;

  let offset = date.day - month.days; // 1-based position within the combined intercalary block
  if (offset <= 0) return null;

  for (const ic of config.intercalary) {
    if (ic.afterMonth !== date.month) continue;
    if (offset <= ic.days) {
      return { period: ic, dayIndex: offset };
    }
    offset -= ic.days;
  }
  return null; // beyond all intercalary days after this month — not a valid date
}

// ─── Season ───────────────────────────────────────────────────────────────────

export function getCurrentSeason(date: CalendarDate, config: CalendarConfig): CalendarSeason | null {
  // Intercalary days aren't part of any month, so they'd fall outside every
  // season's month/day range by construction. Inherit the season of the
  // last real day of the preceding month instead.
  const ic = getIntercalaryDay(date, config);
  const effectiveDate: CalendarDate = ic
    ? { year: date.year, month: date.month, day: config.months[date.month - 1].days }
    : date;

  for (const season of config.seasons) {
    if (isDateInSeason(effectiveDate, season)) return season;
  }
  return null;
}

function isDateInSeason(date: CalendarDate, season: CalendarSeason): boolean {
  const { month: m, day: d } = date;
  const start = season.startMonth * 1000 + season.startDay;
  const end = season.endMonth * 1000 + season.endDay;
  const cur = m * 1000 + d;

  if (start <= end) {
    return cur >= start && cur <= end;
  } else {
    // Wraps over year boundary
    return cur >= start || cur <= end;
  }
}

// ─── Month grid helpers ───────────────────────────────────────────────────────

/**
 * Return the 0-based weekday column for the first day of a given month,
 * used to offset the calendar grid.
 */
export function firstWeekdayOfMonth(year: number, month: number, config: CalendarConfig): number {
  if (config.weekdays.length === 0) return 0;
  const firstDay = { year, month, day: 1 };
  const weekdayName = computeWeekday(firstDay, config);
  return config.weekdays.indexOf(weekdayName);
}
