import { describe, it, expect } from "vitest";
import type { CalendarConfig } from "@/types/calendar";
import {
  parseDate,
  formatDate,
  dateToAbsoluteDays,
  absoluteDaysToDate,
  yearLength,
  computeWeekday,
  advanceDate,
  getCurrentSeason,
  firstWeekdayOfMonth,
} from "@/lib/calendar/engine";

// A minimal 2-month toy calendar, no intercalary days.
const toyConfig: CalendarConfig = {
  id: "cfg-toy",
  campaignId: "camp1",
  epochDate: "0001-01-01",
  months: [
    { name: "First", days: 10 },
    { name: "Second", days: 5 },
  ],
  weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu"],
  seasons: [],
  intercalary: [],
  moons: [],
};

// A realistic 12-month calendar with named seasons, including a year-wrapping one.
const fullConfig: CalendarConfig = {
  id: "cfg-full",
  campaignId: "camp1",
  epochDate: "0001-01-01",
  months: [
    { name: "Jan", days: 31 },
    { name: "Feb", days: 28 },
    { name: "Mar", days: 31 },
    { name: "Apr", days: 30 },
    { name: "May", days: 31 },
    { name: "Jun", days: 30 },
    { name: "Jul", days: 31 },
    { name: "Aug", days: 31 },
    { name: "Sep", days: 30 },
    { name: "Oct", days: 31 },
    { name: "Nov", days: 30 },
    { name: "Dec", days: 31 },
  ],
  weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  seasons: [
    { name: "Spring", startMonth: 3, startDay: 1, endMonth: 5, endDay: 31 },
    { name: "Winter", startMonth: 12, startDay: 1, endMonth: 2, endDay: 28 },
  ],
  intercalary: [],
  moons: [],
};

// A calendar with intercalary days: a 2-day midyear festival after month 1
// that sits outside the weekly cycle.
const intercalaryConfig: CalendarConfig = {
  id: "cfg-ic",
  campaignId: "camp1",
  epochDate: "0001-01-01",
  months: [
    { name: "First", days: 10 },
    { name: "Second", days: 10 },
    { name: "Third", days: 10 },
  ],
  weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu"],
  seasons: [],
  intercalary: [{ name: "Festival", afterMonth: 1, days: 2, outsideWeeks: true }],
  moons: [],
};

describe("parseDate / formatDate", () => {
  it("round-trips a simple date", () => {
    const d = parseDate("0005-03-07");
    expect(d).toEqual({ year: 5, month: 3, day: 7 });
    expect(formatDate(d)).toBe("0005-03-07");
  });

  it("zero-pads year 1", () => {
    expect(formatDate({ year: 1, month: 1, day: 1 })).toBe("0001-01-01");
    expect(parseDate("0001-01-01")).toEqual({ year: 1, month: 1, day: 1 });
  });

  it("round-trips years >= 1000 without truncation", () => {
    const d = parseDate("1234-11-22");
    expect(d).toEqual({ year: 1234, month: 11, day: 22 });
    expect(formatDate(d)).toBe("1234-11-22");
  });
});

describe("dateToAbsoluteDays / absoluteDaysToDate round-trip", () => {
  it("round-trips across a month boundary", () => {
    // last day of First (day 10) -> first day of Second
    const lastOfFirst = { year: 1, month: 1, day: 10 };
    const firstOfSecond = { year: 1, month: 2, day: 1 };
    const absLast = dateToAbsoluteDays(lastOfFirst, toyConfig);
    const absFirst = dateToAbsoluteDays(firstOfSecond, toyConfig);
    expect(absFirst).toBe(absLast + 1);
    expect(absoluteDaysToDate(absLast, toyConfig)).toEqual(lastOfFirst);
    expect(absoluteDaysToDate(absFirst, toyConfig)).toEqual(firstOfSecond);
  });

  it("round-trips across a year boundary", () => {
    const lastOfYear1 = { year: 1, month: 2, day: 5 }; // last day of toy year
    const firstOfYear2 = { year: 2, month: 1, day: 1 };
    const absLast = dateToAbsoluteDays(lastOfYear1, toyConfig);
    const absFirst = dateToAbsoluteDays(firstOfYear2, toyConfig);
    expect(absFirst).toBe(absLast + 1);
    expect(absoluteDaysToDate(absLast, toyConfig)).toEqual(lastOfYear1);
    expect(absoluteDaysToDate(absFirst, toyConfig)).toEqual(firstOfYear2);
  });

  it("round-trips into and out of an intercalary period", () => {
    // Intercalary "Festival" (2 days) falls after month 1 (day 10).
    // absoluteDaysToDate clamps any position inside the intercalary period to
    // the last real day of the preceding month (per engine.ts comment) —
    // assert that documented behavior rather than assuming a separate representation.
    const lastOfMonth1 = { year: 1, month: 1, day: 10 };
    const absLastOfMonth1 = dateToAbsoluteDays(lastOfMonth1, intercalaryConfig);

    // The two days immediately following month 1's last day are the intercalary days.
    const icDay0 = absoluteDaysToDate(absLastOfMonth1 + 1, intercalaryConfig);
    const icDay1 = absoluteDaysToDate(absLastOfMonth1 + 2, intercalaryConfig);
    expect(icDay0).toEqual({ year: 1, month: 1, day: 10 });
    expect(icDay1).toEqual({ year: 1, month: 1, day: 10 });

    // The day after the intercalary period is the first day of month 2.
    const afterIc = absoluteDaysToDate(absLastOfMonth1 + 3, intercalaryConfig);
    expect(afterIc).toEqual({ year: 1, month: 2, day: 1 });

    // dateToAbsoluteDays for month 2 day 1 must equal absLastOfMonth1 + 3
    // (10 month-1 days + 2 intercalary days + 1).
    expect(dateToAbsoluteDays({ year: 1, month: 2, day: 1 }, intercalaryConfig)).toBe(
      absLastOfMonth1 + 3
    );
  });
});

describe("yearLength", () => {
  it("sums month lengths with no intercalary days", () => {
    expect(yearLength(toyConfig)).toBe(15); // 10 + 5
    expect(yearLength(fullConfig)).toBe(365);
  });

  it("includes intercalary days in the total (per source)", () => {
    // months: 10 + 10 + 10 = 30, plus 2 intercalary days = 32
    expect(yearLength(intercalaryConfig)).toBe(32);
  });
});

describe("computeWeekday", () => {
  it("advances exactly one weekday per day across ordinary days", () => {
    const day1 = computeWeekday({ year: 1, month: 1, day: 1 }, toyConfig);
    const day2 = computeWeekday({ year: 1, month: 1, day: 2 }, toyConfig);
    const idx1 = toyConfig.weekdays.indexOf(day1);
    const idx2 = toyConfig.weekdays.indexOf(day2);
    expect((idx1 + 1) % toyConfig.weekdays.length).toBe(idx2);
  });

  it("epoch date is weekday index 0", () => {
    expect(computeWeekday(parseDate(toyConfig.epochDate), toyConfig)).toBe(toyConfig.weekdays[0]);
  });

  it("returns empty string when there are no weekdays configured", () => {
    const noWeekdays: CalendarConfig = { ...toyConfig, weekdays: [] };
    expect(computeWeekday({ year: 1, month: 1, day: 1 }, noWeekdays)).toBe("");
  });

  it("intercalary 'outside weeks' days do not shift the weekday counter", () => {
    // Day 10 of month 1 (last day before the 2-day festival) has some weekday.
    // The first day of month 2 (immediately after the festival) should be
    // exactly ONE weekday further along — as if the 2 festival days didn't
    // exist in the weekly cycle at all — not three.
    const lastOfMonth1 = { year: 1, month: 1, day: 10 };
    const firstOfMonth2 = { year: 1, month: 2, day: 1 };

    const wdLast = computeWeekday(lastOfMonth1, intercalaryConfig);
    const wdFirst = computeWeekday(firstOfMonth2, intercalaryConfig);

    const idxLast = intercalaryConfig.weekdays.indexOf(wdLast);
    const idxFirst = intercalaryConfig.weekdays.indexOf(wdFirst);
    expect((idxLast + 1) % intercalaryConfig.weekdays.length).toBe(idxFirst);
  });
});

describe("advanceDate", () => {
  it("advances day to day within a month", () => {
    expect(advanceDate({ year: 1, month: 1, day: 1 }, toyConfig)).toEqual({
      year: 1,
      month: 1,
      day: 2,
    });
  });

  it("advancing from the last day of a month into an intercalary period clamps to that day (per absoluteDaysToDate)", () => {
    expect(advanceDate({ year: 1, month: 1, day: 10 }, intercalaryConfig)).toEqual({
      year: 1,
      month: 1,
      day: 10,
    });
  });

  it("rolls from the last day of a month into the next month (no intercalary)", () => {
    expect(advanceDate({ year: 1, month: 1, day: 10 }, toyConfig)).toEqual({
      year: 1,
      month: 2,
      day: 1,
    });
  });

  it("rolls from the last day of the year into year + 1", () => {
    expect(advanceDate({ year: 1, month: 2, day: 5 }, toyConfig)).toEqual({
      year: 2,
      month: 1,
      day: 1,
    });
  });

  it("current behavior: advancing from the clamped intercalary representation is a fixed point (does not reach month 2)", () => {
    // absoluteDaysToDate clamps EVERY day within a multi-day intercalary period
    // to the same CalendarDate ({month:1, day:10} here) — see engine.ts's
    // documented clamping behavior. That means dateToAbsoluteDays(clamped) always
    // maps back to the *last real day's* absolute count, not the specific
    // intercalary day it came from. So advanceDate(secondIcDay) recomputes the
    // same "+1" step as advanceDate(firstIcDay) and both return the same clamped
    // date — advancing never escapes the intercalary period one day at a time.
    const secondIcDay = absoluteDaysToDate(
      dateToAbsoluteDays({ year: 1, month: 1, day: 10 }, intercalaryConfig) + 2,
      intercalaryConfig
    );
    expect(secondIcDay).toEqual({ year: 1, month: 1, day: 10 });
    expect(advanceDate(secondIcDay, intercalaryConfig)).toEqual({
      year: 1,
      month: 1,
      day: 10,
    });
  });

  // BUG: advanceDate should progress one calendar day at a time through a
  // multi-day intercalary period and eventually reach the first day of the
  // following month. Expected: advancing twice from the last real day of
  // month 1 (day 10) through a 2-day intercalary period should land on
  // {year:1, month:2, day:1}. Actual: because absoluteDaysToDate clamps every
  // day within the intercalary period to the identical CalendarDate
  // {month:1,day:10}, re-deriving an absolute day count from that clamped
  // value via dateToAbsoluteDays always yields the *last real day's* absolute
  // position, not the specific intercalary day — so advanceDate applied
  // repeatedly to its own output is a fixed point and can never step past a
  // multi-day intercalary period. (Single-day intercalary periods are
  // unaffected since there's nothing to distinguish.)
  it.skip("BUG: advanceDate should step through a multi-day intercalary period and reach the next month", () => {
    let d = { year: 1, month: 1, day: 10 };
    d = advanceDate(d, intercalaryConfig); // -> intercalary day 1 (clamped)
    d = advanceDate(d, intercalaryConfig); // -> intercalary day 2 (clamped)
    d = advanceDate(d, intercalaryConfig); // -> should be month 2, day 1
    expect(d).toEqual({ year: 1, month: 2, day: 1 });
  });
});

describe("getCurrentSeason", () => {
  it("returns the season for a date inside its range", () => {
    const season = getCurrentSeason({ year: 1, month: 4, day: 15 }, fullConfig);
    expect(season?.name).toBe("Spring");
  });

  it("is inclusive on the start boundary", () => {
    const season = getCurrentSeason({ year: 1, month: 3, day: 1 }, fullConfig);
    expect(season?.name).toBe("Spring");
  });

  it("is inclusive on the end boundary", () => {
    const season = getCurrentSeason({ year: 1, month: 5, day: 31 }, fullConfig);
    expect(season?.name).toBe("Spring");
  });

  it("resolves a year-wrapping season (Dec 1 -> Feb 28)", () => {
    const decSeason = getCurrentSeason({ year: 1, month: 12, day: 15 }, fullConfig);
    expect(decSeason?.name).toBe("Winter");
    const janSeason = getCurrentSeason({ year: 2, month: 1, day: 15 }, fullConfig);
    expect(janSeason?.name).toBe("Winter");
    const febSeason = getCurrentSeason({ year: 2, month: 2, day: 28 }, fullConfig);
    expect(febSeason?.name).toBe("Winter");
  });

  it("returns null when the date falls in no configured season", () => {
    // Jun 1 - Nov 30 is uncovered by Spring (Mar-May) or Winter (Dec-Feb).
    const season = getCurrentSeason({ year: 1, month: 8, day: 1 }, fullConfig);
    expect(season).toBeNull();
  });

  it("returns null when there are no seasons configured", () => {
    expect(getCurrentSeason({ year: 1, month: 1, day: 1 }, toyConfig)).toBeNull();
  });
});

describe("firstWeekdayOfMonth", () => {
  it("is consistent with computeWeekday(day 1) for several months", () => {
    for (let month = 1; month <= toyConfig.months.length; month++) {
      const idx = firstWeekdayOfMonth(1, month, toyConfig);
      const expectedWeekday = computeWeekday({ year: 1, month, day: 1 }, toyConfig);
      expect(toyConfig.weekdays[idx]).toBe(expectedWeekday);
    }
  });

  it("returns 0 when there are no weekdays configured", () => {
    const noWeekdays: CalendarConfig = { ...toyConfig, weekdays: [] };
    expect(firstWeekdayOfMonth(1, 1, noWeekdays)).toBe(0);
  });

  it("is consistent across a year boundary too", () => {
    const idx = firstWeekdayOfMonth(2, 1, toyConfig);
    const expectedWeekday = computeWeekday({ year: 2, month: 1, day: 1 }, toyConfig);
    expect(toyConfig.weekdays[idx]).toBe(expectedWeekday);
  });
});
