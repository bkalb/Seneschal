import { describe, it, expect } from "vitest";
import type { CalendarConfig } from "@/types/calendar";
import {
  parseDate,
  formatDate,
  formatCampaignDate,
  dateToAbsoluteDays,
  absoluteDaysToDate,
  yearLength,
  computeWeekday,
  advanceDate,
  getCurrentSeason,
  firstWeekdayOfMonth,
  getIntercalaryDay,
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

describe("formatCampaignDate", () => {
  it("renders day, month name, and year", () => {
    expect(formatCampaignDate("1247-08-12", fullConfig)).toBe("12 Aug 1247");
  });

  it("does not zero-pad the day", () => {
    expect(formatCampaignDate("1247-01-05", fullConfig)).toBe("5 Jan 1247");
  });

  it("falls back to `Month ${m}` for an out-of-range month index, mirroring the inline fallback", () => {
    // toyConfig only has 2 months; month 5 doesn't exist.
    expect(formatCampaignDate("0001-05-03", toyConfig)).toBe("3 Month 5 1");
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

  it("round-trips into and out of an intercalary period, representing each day distinctly", () => {
    // Intercalary "Festival" (2 days) falls after month 1 (day 10). Each day
    // of the period gets its own CalendarDate: { month: 1, day: 11 } and
    // { month: 1, day: 12 } (10 + k, 1-based) — NOT a clamp to day 10.
    const lastOfMonth1 = { year: 1, month: 1, day: 10 };
    const absLastOfMonth1 = dateToAbsoluteDays(lastOfMonth1, intercalaryConfig);

    const icDay1 = absoluteDaysToDate(absLastOfMonth1 + 1, intercalaryConfig);
    const icDay2 = absoluteDaysToDate(absLastOfMonth1 + 2, intercalaryConfig);
    expect(icDay1).toEqual({ year: 1, month: 1, day: 11 });
    expect(icDay2).toEqual({ year: 1, month: 1, day: 12 });

    // The day after the intercalary period is the first day of month 2.
    const afterIc = absoluteDaysToDate(absLastOfMonth1 + 3, intercalaryConfig);
    expect(afterIc).toEqual({ year: 1, month: 2, day: 1 });

    // dateToAbsoluteDays for month 2 day 1 must equal absLastOfMonth1 + 3
    // (10 month-1 days + 2 intercalary days + 1).
    expect(dateToAbsoluteDays({ year: 1, month: 2, day: 1 }, intercalaryConfig)).toBe(
      absLastOfMonth1 + 3
    );

    // And each intercalary CalendarDate maps back to its own distinct abs day.
    expect(dateToAbsoluteDays(icDay1, intercalaryConfig)).toBe(absLastOfMonth1 + 1);
    expect(dateToAbsoluteDays(icDay2, intercalaryConfig)).toBe(absLastOfMonth1 + 2);
  });

  it("getIntercalaryDay identifies intercalary dates and their 1-based index within the period", () => {
    expect(getIntercalaryDay({ year: 1, month: 1, day: 10 }, intercalaryConfig)).toBeNull(); // last real day
    expect(getIntercalaryDay({ year: 1, month: 1, day: 11 }, intercalaryConfig)).toEqual({
      period: intercalaryConfig.intercalary[0],
      dayIndex: 1,
    });
    expect(getIntercalaryDay({ year: 1, month: 1, day: 12 }, intercalaryConfig)).toEqual({
      period: intercalaryConfig.intercalary[0],
      dayIndex: 2,
    });
    expect(getIntercalaryDay({ year: 1, month: 2, day: 1 }, intercalaryConfig)).toBeNull(); // first real day of next month
  });

  describe("bijection property: dateToAbsoluteDays(absoluteDaysToDate(n)) === n", () => {
    const configs: { name: string; config: CalendarConfig }[] = [
      { name: "no intercalary", config: toyConfig },
      {
        name: "1-day intercalary period",
        config: {
          ...toyConfig,
          intercalary: [{ name: "Feast", afterMonth: 1, days: 1, outsideWeeks: true }],
        },
      },
      {
        name: "multi-day intercalary period (outsideWeeks: true)",
        config: intercalaryConfig,
      },
      {
        name: "multi-day intercalary period (outsideWeeks: false)",
        config: {
          ...intercalaryConfig,
          intercalary: [{ name: "Festival", afterMonth: 1, days: 3, outsideWeeks: false }],
        },
      },
      {
        name: "intercalary after the LAST month",
        config: {
          ...toyConfig,
          intercalary: [{ name: "Year's End", afterMonth: 2, days: 2, outsideWeeks: true }],
        },
      },
      {
        name: "two separate intercalary periods after the SAME month",
        config: {
          ...toyConfig,
          intercalary: [
            { name: "Spring Rite", afterMonth: 1, days: 2, outsideWeeks: true },
            { name: "Spring Feast", afterMonth: 1, days: 3, outsideWeeks: false },
          ],
        },
      },
    ];

    for (const { name, config } of configs) {
      it(`holds for several thousand consecutive days: ${name}`, () => {
        for (let abs = 0; abs < 5000; abs++) {
          const date = absoluteDaysToDate(abs, config);
          expect(dateToAbsoluteDays(date, config)).toBe(abs);
        }
      });
    }
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

  it("outsideWeeks: false — the weekday cycle advances normally through the intercalary period", () => {
    const advancingConfig: CalendarConfig = {
      ...intercalaryConfig,
      intercalary: [{ name: "Festival", afterMonth: 1, days: 2, outsideWeeks: false }],
    };
    // Walk day-by-day across the whole period (day 10 -> ic day 11 -> ic day
    // 12 -> month 2 day 1) and confirm the weekday advances by exactly one
    // step every time, same as any ordinary day.
    let d = { year: 1, month: 1, day: 10 };
    let prevIdx = advancingConfig.weekdays.indexOf(computeWeekday(d, advancingConfig));
    for (let i = 0; i < 3; i++) {
      d = advanceDate(d, advancingConfig);
      const idx = advancingConfig.weekdays.indexOf(computeWeekday(d, advancingConfig));
      expect(idx).toBe((prevIdx + 1) % advancingConfig.weekdays.length);
      prevIdx = idx;
    }
    expect(d).toEqual({ year: 1, month: 2, day: 1 });
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

  describe("steps through an intercalary period one day at a time and does not get stuck (the frozen-date bug)", () => {
    for (const n of [1, 2, 3]) {
      it(`N=${n}: advances through an ${n}-day intercalary period and reaches the next month`, () => {
        const config: CalendarConfig = {
          ...intercalaryConfig,
          intercalary: [{ name: "Festival", afterMonth: 1, days: n, outsideWeeks: true }],
        };
        let d = { year: 1, month: 1, day: 10 }; // last real day of month 1
        const seen: Array<{ year: number; month: number; day: number }> = [d];
        for (let i = 0; i < n + 1; i++) {
          d = advanceDate(d, config);
          seen.push(d);
        }
        // Reaches month 2, day 1 — not stuck repeating the same date.
        expect(d).toEqual({ year: 1, month: 2, day: 1 });
        // Every intermediate step is a distinct date (no fixed point).
        const stringified = seen.map((s) => `${s.year}-${s.month}-${s.day}`);
        expect(new Set(stringified).size).toBe(stringified.length);
        // Advancing one more day continues normally past the period too.
        expect(advanceDate(d, config)).toEqual({ year: 1, month: 2, day: 2 });
      });
    }
  });

  it("repeated advancing from a fixed start walks strictly forward across a multi-day period (regression for the freeze)", () => {
    // This directly reproduces the reported symptom: advancing repeatedly
    // from the day before a multi-day intercalary period must never return
    // the same date twice.
    let d = { year: 1, month: 1, day: 9 };
    const dates: string[] = [];
    for (let i = 0; i < 6; i++) {
      d = advanceDate(d, intercalaryConfig);
      dates.push(`${d.year}-${d.month}-${d.day}`);
    }
    expect(dates).toEqual([
      "1-1-10", // last real day of month 1
      "1-1-11", // intercalary day 1
      "1-1-12", // intercalary day 2
      "1-2-1", // first real day of month 2
      "1-2-2",
      "1-2-3",
    ]);
    expect(new Set(dates).size).toBe(dates.length);
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

  it("an intercalary day inherits the season of the last real day of its preceding month", () => {
    // fullConfig's Spring runs Mar 1 - May 31. Attach a 2-day intercalary
    // period after March (the last real day of March, Mar 31, is in Spring).
    const configWithIc: CalendarConfig = {
      ...fullConfig,
      intercalary: [{ name: "Rite of Spring", afterMonth: 3, days: 2, outsideWeeks: true }],
    };
    const icDay1 = getIntercalaryDay({ year: 1, month: 3, day: 32 }, configWithIc);
    const icDay2 = getIntercalaryDay({ year: 1, month: 3, day: 33 }, configWithIc);
    expect(icDay1).toEqual({ period: configWithIc.intercalary[0], dayIndex: 1 });
    expect(icDay2).toEqual({ period: configWithIc.intercalary[0], dayIndex: 2 });

    expect(getCurrentSeason({ year: 1, month: 3, day: 32 }, configWithIc)?.name).toBe("Spring");
    expect(getCurrentSeason({ year: 1, month: 3, day: 33 }, configWithIc)?.name).toBe("Spring");
    // Sanity: matches the season of Mar 31 itself.
    expect(getCurrentSeason({ year: 1, month: 3, day: 31 }, configWithIc)?.name).toBe(
      getCurrentSeason({ year: 1, month: 3, day: 32 }, configWithIc)?.name
    );
  });

  it("an intercalary day after a month with no configured season still returns null", () => {
    // Jun 1 - Nov 30 has no season in fullConfig; an intercalary period after
    // August (uncovered) should also resolve to null, not throw or match
    // some unrelated season by coincidence of the day number.
    const configWithIc: CalendarConfig = {
      ...fullConfig,
      intercalary: [{ name: "Dog Days", afterMonth: 8, days: 1, outsideWeeks: true }],
    };
    expect(getCurrentSeason({ year: 1, month: 8, day: 32 }, configWithIc)).toBeNull();
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
