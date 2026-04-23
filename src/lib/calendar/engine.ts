import type { CalendarDate, CalendarDateString, CalendarConfig, CalendarSeason } from "@/types/calendar";

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
    const icStartInYear = daysToEndOfMonth(ic.afterMonth, config);
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

    // Check for intercalary after this month
    for (const ic of config.intercalary) {
      if (ic.afterMonth === m) {
        if (remaining < ic.days) {
          // We're inside an intercalary period — treat as the last day of the prior month
          // by clamping to the last real day (intercalary days aren't in a "month")
          return { year, month: m, day: config.months[m - 1].days };
        }
        remaining -= ic.days;
      }
    }
  }

  // Fallback: last day of year
  return { year, month: config.months.length, day: config.months[config.months.length - 1].days };
}

// ─── Season ───────────────────────────────────────────────────────────────────

export function getCurrentSeason(date: CalendarDate, config: CalendarConfig): CalendarSeason | null {
  for (const season of config.seasons) {
    if (isDateInSeason(date, season)) return season;
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
