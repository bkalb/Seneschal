/**
 * Calendar event occurrence engine — PURE.
 *
 * Computes when a `CalendarEvent` (one-off, annual, monthly, or moon-phase
 * recurring) actually falls within a date range, or when its next
 * occurrence is on/after a given date. All date math goes through
 * `src/lib/calendar/engine.ts` so it stays consistent with the rest of the
 * custom-calendar system (variable month lengths, intercalary days, etc.).
 */
import type {
  CalendarConfig,
  CalendarDate,
  CalendarDateString,
  CalendarEvent,
  Moon,
  MoonPhase,
} from "@/types/calendar";
import {
  dateToAbsoluteDays,
  absoluteDaysToDate,
  parseDate,
  formatDate,
  yearLength,
  getIntercalaryDay,
} from "./engine";
import { computeMoonPhase } from "./moon";

export interface EventOccurrence {
  event: CalendarEvent;
  date: CalendarDateString; // the occurrence date in campaign calendar
  daysUntil: number; // signed; 0 = today, negative = past
}

// ─── Range query (brute-force day walk — fine for month-grid-sized ranges) ────

/**
 * Return every occurrence of `events` within [fromDate, toDate] inclusive.
 * `daysUntil` on each occurrence is relative to `fromDate`.
 */
export function occurrencesInRange(
  events: CalendarEvent[],
  fromDate: CalendarDateString,
  toDate: CalendarDateString,
  config: CalendarConfig
): EventOccurrence[] {
  const fromAbs = dateToAbsoluteDays(parseDate(fromDate), config);
  const toAbs = dateToAbsoluteDays(parseDate(toDate), config);
  if (toAbs < fromAbs || events.length === 0) return [];

  const moonById = new Map(config.moons.map((m) => [m.id, m]));
  const occurrences: EventOccurrence[] = [];

  for (let abs = fromAbs; abs <= toAbs; abs++) {
    const date = absoluteDaysToDate(abs, config);
    for (const event of events) {
      if (eventOccursOnDate(event, date, config, moonById)) {
        occurrences.push({ event, date: formatDate(date), daysUntil: abs - fromAbs });
      }
    }
  }

  return occurrences;
}

function eventOccursOnDate(
  event: CalendarEvent,
  date: CalendarDate,
  config: CalendarConfig,
  moonById: Map<string, Moon>
): boolean {
  switch (event.recurrence) {
    case "ONCE": {
      const abs = dateToAbsoluteDays(date, config);
      const startAbs = dateToAbsoluteDays(parseDate(event.anchorDate), config);
      const endAbs = event.endDate ? dateToAbsoluteDays(parseDate(event.endDate), config) : startAbs;
      return abs >= startAbs && abs <= endAbs;
    }
    case "ANNUAL": {
      // Intercalary days have a `day` number that extends past the end of
      // their month; guard against a coincidental numeric match against an
      // anchor day that was never meant to refer to one.
      if (getIntercalaryDay(date, config)) return false;
      const anchor = parseDate(event.anchorDate);
      return date.month === anchor.month && date.day === anchor.day;
    }
    case "MONTHLY": {
      // Iterating real calendar days means a nonexistent day (e.g. day 31 in
      // a 28-day month) simply never occurs — short months are skipped for free.
      if (getIntercalaryDay(date, config)) return false;
      const anchor = parseDate(event.anchorDate);
      return date.day === anchor.day;
    }
    case "MOON_PHASE": {
      if (!event.moonId || !event.moonPhase) return false;
      const moon = moonById.get(event.moonId);
      if (!moon) return false;
      return computeMoonPhase(date, moon, config).phase === event.moonPhase;
    }
    default:
      return false;
  }
}

// ─── Upcoming (single next occurrence per event, closed-form where possible) ──

/**
 * Return the next occurrence (daysUntil >= 0) of each event on/after
 * `fromDate`, sorted ascending by daysUntil. Events with no occurrence
 * within `limitDays` are omitted. Used by the "upcoming events" list.
 */
export function upcomingEvents(
  events: CalendarEvent[],
  fromDate: CalendarDateString,
  config: CalendarConfig,
  limitDays: number = yearLength(config)
): EventOccurrence[] {
  const fromAbs = dateToAbsoluteDays(parseDate(fromDate), config);
  const moonById = new Map(config.moons.map((m) => [m.id, m]));
  const results: EventOccurrence[] = [];

  for (const event of events) {
    let occurrenceDate: CalendarDateString | null = null;

    switch (event.recurrence) {
      case "ONCE":
        occurrenceDate = nextOnceOccurrence(event, fromDate, config);
        break;
      case "ANNUAL":
        occurrenceDate = nextAnnualOccurrence(event, fromDate, config);
        break;
      case "MONTHLY":
        occurrenceDate = nextMonthlyOccurrence(event, fromDate, config);
        break;
      case "MOON_PHASE": {
        if (!event.moonId || !event.moonPhase) break;
        const moon = moonById.get(event.moonId);
        if (!moon) break;
        occurrenceDate = nextPhaseDate(moon, event.moonPhase, fromDate, config);
        break;
      }
    }

    if (!occurrenceDate) continue;
    const occAbs = dateToAbsoluteDays(parseDate(occurrenceDate), config);
    const daysUntil = occAbs - fromAbs;
    if (daysUntil < 0 || daysUntil > limitDays) continue;
    results.push({ event, date: occurrenceDate, daysUntil });
  }

  results.sort((a, b) => a.daysUntil - b.daysUntil);
  return results;
}

function nextOnceOccurrence(
  event: CalendarEvent,
  fromDate: CalendarDateString,
  config: CalendarConfig
): CalendarDateString | null {
  const fromAbs = dateToAbsoluteDays(parseDate(fromDate), config);
  const startAbs = dateToAbsoluteDays(parseDate(event.anchorDate), config);
  const endAbs = event.endDate ? dateToAbsoluteDays(parseDate(event.endDate), config) : startAbs;
  if (startAbs >= fromAbs) return event.anchorDate;
  if (endAbs >= fromAbs) return fromDate; // multi-day event already in progress today
  return null; // entirely in the past
}

function nextAnnualOccurrence(
  event: CalendarEvent,
  fromDate: CalendarDateString,
  config: CalendarConfig
): CalendarDateString {
  const anchor = parseDate(event.anchorDate);
  const from = parseDate(fromDate);
  const fromAbs = dateToAbsoluteDays(from, config);

  let candidate: CalendarDate = { year: from.year, month: anchor.month, day: anchor.day };
  if (dateToAbsoluteDays(candidate, config) < fromAbs) {
    candidate = { year: from.year + 1, month: anchor.month, day: anchor.day };
  }
  return formatDate(candidate);
}

function nextMonthlyOccurrence(
  event: CalendarEvent,
  fromDate: CalendarDateString,
  config: CalendarConfig
): CalendarDateString | null {
  const anchor = parseDate(event.anchorDate);
  const from = parseDate(fromDate);
  const fromAbs = dateToAbsoluteDays(from, config);
  const numMonths = config.months.length;
  if (numMonths === 0) return null;

  // Bounded walk: at most two full cycles of months is more than enough to
  // find (or definitively rule out) the day-of-month in a fixed calendar.
  for (let i = 0; i < numMonths * 2; i++) {
    let month = from.month + i;
    let year = from.year;
    while (month > numMonths) {
      month -= numMonths;
      year += 1;
    }
    const monthDays = config.months[month - 1]?.days ?? 0;
    if (anchor.day > monthDays) continue; // skip months shorter than the anchor day
    const candidate: CalendarDate = { year, month, day: anchor.day };
    if (dateToAbsoluteDays(candidate, config) >= fromAbs) {
      return formatDate(candidate);
    }
  }
  return null;
}

/**
 * Walk forward day-by-day from `fromDate` (inclusive) looking for the next
 * date on which `moon` is in `phase`. Bounded by `moon.cycleLength * 2` —
 * cheap since `computeMoonPhase` is O(1) per day. Returns null if not found
 * within the bound (shouldn't happen for a well-formed moon).
 */
export function nextPhaseDate(
  moon: Moon,
  phase: MoonPhase,
  fromDate: CalendarDateString,
  config: CalendarConfig
): CalendarDateString | null {
  const fromAbs = dateToAbsoluteDays(parseDate(fromDate), config);
  const bound = Math.max(moon.cycleLength * 2, 2);
  for (let i = 0; i <= bound; i++) {
    const date = absoluteDaysToDate(fromAbs + i, config);
    if (computeMoonPhase(date, moon, config).phase === phase) {
      return formatDate(date);
    }
  }
  return null;
}
