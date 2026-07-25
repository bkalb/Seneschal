import { describe, it, expect } from "vitest";
import type { CalendarConfig, Moon } from "@/types/calendar";
import { computeMoonPhase, computeAllMoonPhases } from "@/lib/calendar/moon";
import { parseDate, absoluteDaysToDate, dateToAbsoluteDays } from "@/lib/calendar/engine";

const PHASE_NAMES = [
  "new",
  "waxing_crescent",
  "first_quarter",
  "waxing_gibbous",
  "full",
  "waning_gibbous",
  "last_quarter",
  "waning_crescent",
] as const;

const config: CalendarConfig = {
  id: "cfg1",
  campaignId: "camp1",
  epochDate: "0001-01-01",
  months: [
    { name: "Firstmonth", days: 31 },
    { name: "Secondmonth", days: 30 },
    { name: "Thirdmonth", days: 31 },
    { name: "Fourthmonth", days: 30 },
  ],
  weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  seasons: [],
  intercalary: [],
  moons: [],
};

const moonA: Moon = { id: "moonA", name: "Luna", cycleLength: 30, referenceNewMoon: "0001-01-01" };
// A different cycle length that doesn't evenly divide moonA's, to check independence.
const moonB: Moon = { id: "moonB", name: "Umbra", cycleLength: 7, referenceNewMoon: "0001-01-01" };

describe("computeMoonPhase", () => {
  it("day 0 (the reference new moon) is phase 'new' with dayInCycle 0", () => {
    const result = computeMoonPhase(parseDate(moonA.referenceNewMoon), moonA, config);
    expect(result.phase).toBe("new");
    expect(result.dayInCycle).toBe(0);
  });

  it("phase advances with absolute days: dayInCycle increases by 1 per day", () => {
    const d0 = parseDate("0001-01-01");
    const d1 = parseDate("0001-01-02");
    const r0 = computeMoonPhase(d0, moonA, config);
    const r1 = computeMoonPhase(d1, moonA, config);
    expect(r1.dayInCycle).toBe(r0.dayInCycle + 1);
  });

  it("wraps cleanly at the end of a cycle back to dayInCycle 0 / phase 'new'", () => {
    const dateAtCycleStart = absoluteDaysToDate(
      dateToAbsoluteDays(parseDate(moonA.referenceNewMoon), config) + moonA.cycleLength,
      config
    );
    const result = computeMoonPhase(dateAtCycleStart, moonA, config);
    expect(result.dayInCycle).toBe(0);
    expect(result.phase).toBe("new");
  });

  it("handles dates before the reference new moon via positive modulo", () => {
    // Use a moon whose reference date is NOT the epoch, so "one day before" is
    // still a valid real calendar date (absoluteDaysToDate on abs < 0, i.e.
    // before the epoch, is out of scope for this file).
    const midYearMoon: Moon = { id: "mid", name: "Mid", cycleLength: 30, referenceNewMoon: "0001-02-01" };
    const dayBefore = parseDate("0001-01-31"); // one real day before the reference
    const result = computeMoonPhase(dayBefore, midYearMoon, config);
    expect(result.dayInCycle).toBe(midYearMoon.cycleLength - 1);
  });

  it("hits every phase-name boundary exactly, computed from cycle length rather than hardcoded", () => {
    const refAbs = dateToAbsoluteDays(parseDate(moonA.referenceNewMoon), config);
    for (let i = 0; i < PHASE_NAMES.length; i++) {
      // Boundary day for phase i: the first dayInCycle whose
      // floor(dayInCycle / cycleLength * numPhases) === i.
      const boundaryDay = Math.ceil((i * moonA.cycleLength) / PHASE_NAMES.length);
      const date = absoluteDaysToDate(refAbs + boundaryDay, config);
      const result = computeMoonPhase(date, moonA, config);
      expect(result.phase).toBe(PHASE_NAMES[i]);
    }
  });

  it("caps the phase index at the last phase name (guards float rounding at the top of the cycle)", () => {
    const lastDay = absoluteDaysToDate(
      dateToAbsoluteDays(parseDate(moonA.referenceNewMoon), config) + moonA.cycleLength - 1,
      config
    );
    const result = computeMoonPhase(lastDay, moonA, config);
    expect(result.phase).toBe("waning_crescent");
    expect(PHASE_NAMES.includes(result.phase)).toBe(true);
  });
});

describe("computeAllMoonPhases", () => {
  it("returns one result per moon, in config order", () => {
    const cfg: CalendarConfig = { ...config, moons: [moonA, moonB] };
    const results = computeAllMoonPhases(parseDate("0001-01-01"), cfg);
    expect(results).toHaveLength(2);
    expect(results[0].moon.id).toBe("moonA");
    expect(results[1].moon.id).toBe("moonB");
  });

  it("multiple moons with different cycle lengths stay independent", () => {
    const cfg: CalendarConfig = { ...config, moons: [moonA, moonB] };
    // Day 7 -> moonA.dayInCycle = 7 (of 30), moonB.dayInCycle = 0 (of 7, wraps exactly)
    const date = absoluteDaysToDate(
      dateToAbsoluteDays(parseDate("0001-01-01"), cfg) + 7,
      cfg
    );
    const results = computeAllMoonPhases(date, cfg);
    const a = results.find((r) => r.moon.id === "moonA")!;
    const b = results.find((r) => r.moon.id === "moonB")!;
    expect(a.dayInCycle).toBe(7);
    expect(b.dayInCycle).toBe(0);
    expect(b.phase).toBe("new");
  });

  it("returns an empty array when the config has no moons", () => {
    expect(computeAllMoonPhases(parseDate("0001-01-01"), config)).toEqual([]);
  });
});
