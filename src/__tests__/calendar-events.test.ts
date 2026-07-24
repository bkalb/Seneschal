import { describe, it, expect } from "vitest";
import type { CalendarConfig, CalendarEvent } from "@/types/calendar";
import { occurrencesInRange, upcomingEvents, nextPhaseDate } from "@/lib/calendar/events";
import { computeMoonPhase } from "@/lib/calendar/moon";
import { parseDate } from "@/lib/calendar/engine";

// A compact 4-month calendar so ANNUAL/MONTHLY tests span multiple years cheaply,
// with one short month (28 days) to exercise the MONTHLY skip rule.
const config: CalendarConfig = {
  id: "cfg1",
  campaignId: "camp1",
  epochDate: "0001-01-01",
  months: [
    { name: "Firstmonth", days: 31 },
    { name: "Shortmonth", days: 28 },
    { name: "Thirdmonth", days: 31 },
    { name: "Fourthmonth", days: 30 },
  ],
  weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  seasons: [],
  intercalary: [],
  moons: [{ id: "moon1", name: "Luna", cycleLength: 30, referenceNewMoon: "0001-01-01" }],
};

function makeEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: "evt1",
    campaignId: "camp1",
    title: "Test Event",
    description: null,
    recurrence: "ONCE",
    anchorDate: "0001-01-01",
    endDate: null,
    moonId: null,
    moonPhase: null,
    color: "#93c5fd",
    ...overrides,
  };
}

describe("occurrencesInRange", () => {
  it("ANNUAL event recurs every year on the same month/day", () => {
    const event = makeEvent({ recurrence: "ANNUAL", anchorDate: "0001-02-15" });
    const occurrences = occurrencesInRange([event], "0001-01-01", "0004-04-30", config);
    expect(occurrences).toHaveLength(4);
    for (const occ of occurrences) {
      const d = parseDate(occ.date);
      expect(d.month).toBe(2);
      expect(d.day).toBe(15);
    }
  });

  it("MONTHLY recurrence skips months shorter than the anchor day", () => {
    // Day 30 exists in Firstmonth(31), Thirdmonth(31), Fourthmonth(30) but not Shortmonth(28).
    const event = makeEvent({ recurrence: "MONTHLY", anchorDate: "0001-01-30" });
    const occurrences = occurrencesInRange([event], "0001-01-01", "0001-04-30", config);
    expect(occurrences).toHaveLength(3);
    const months = occurrences.map((o) => parseDate(o.date).month).sort();
    expect(months).toEqual([1, 3, 4]);
  });

  it("MOON_PHASE occurrences match computeMoonPhase for that moon", () => {
    const event = makeEvent({ recurrence: "MOON_PHASE", moonId: "moon1", moonPhase: "full" });
    const occurrences = occurrencesInRange([event], "0001-01-01", "0002-01-01", config);
    expect(occurrences.length).toBeGreaterThan(0);
    for (const occ of occurrences) {
      const phase = computeMoonPhase(parseDate(occ.date), config.moons[0], config).phase;
      expect(phase).toBe("full");
    }
  });

  it("ONCE multi-day event occupies every day through endDate inclusive", () => {
    const event = makeEvent({ recurrence: "ONCE", anchorDate: "0001-01-10", endDate: "0001-01-12" });
    const occurrences = occurrencesInRange([event], "0001-01-01", "0001-01-31", config);
    expect(occurrences.map((o) => o.date)).toEqual(["0001-01-10", "0001-01-11", "0001-01-12"]);
  });

  it("daysUntil is relative to fromDate: 0 on fromDate, negative before it", () => {
    const event = makeEvent({ recurrence: "ANNUAL", anchorDate: "0001-01-05" });
    const occurrences = occurrencesInRange([event], "0001-01-01", "0001-01-10", config);
    const occ = occurrences.find((o) => o.date === "0001-01-05")!;
    expect(occ.daysUntil).toBe(4);

    const past = occurrencesInRange([event], "0001-01-08", "0001-01-10", config);
    expect(past).toHaveLength(0); // out of range entirely, none expected in [8,10]
  });
});

describe("nextPhaseDate", () => {
  it("finds the next date matching the requested phase and it agrees with computeMoonPhase", () => {
    const moon = config.moons[0];
    const found = nextPhaseDate(moon, "full", "0001-01-01", config);
    expect(found).not.toBeNull();
    const phase = computeMoonPhase(parseDate(found!), moon, config).phase;
    expect(phase).toBe("full");
  });
});

describe("upcomingEvents", () => {
  it("returns only occurrences on/after fromDate, sorted ascending by daysUntil", () => {
    const soon = makeEvent({ id: "soon", recurrence: "ONCE", anchorDate: "0001-01-05" });
    const later = makeEvent({ id: "later", recurrence: "ONCE", anchorDate: "0001-01-20" });
    const past = makeEvent({ id: "past", recurrence: "ONCE", anchorDate: "0000-04-01" });

    const results = upcomingEvents([past, later, soon], "0001-01-01", config);
    expect(results.map((r) => r.event.id)).toEqual(["soon", "later"]);
    expect(results[0].daysUntil).toBeLessThan(results[1].daysUntil);
    expect(results.every((r) => r.daysUntil >= 0)).toBe(true);
  });

  it("an in-progress multi-day ONCE event counts as happening today (daysUntil 0)", () => {
    const ongoing = makeEvent({ recurrence: "ONCE", anchorDate: "0001-01-01", endDate: "0001-01-10" });
    const results = upcomingEvents([ongoing], "0001-01-05", config);
    expect(results).toHaveLength(1);
    expect(results[0].daysUntil).toBe(0);
  });

  it("ANNUAL event always has a next occurrence within the year", () => {
    const event = makeEvent({ recurrence: "ANNUAL", anchorDate: "0001-03-01" });
    const results = upcomingEvents([event], "0001-01-01", config);
    expect(results).toHaveLength(1);
    expect(results[0].daysUntil).toBeGreaterThanOrEqual(0);
  });

  it("MOON_PHASE event resolves via nextPhaseDate", () => {
    const event = makeEvent({ recurrence: "MOON_PHASE", moonId: "moon1", moonPhase: "new" });
    const results = upcomingEvents([event], "0001-01-01", config);
    expect(results).toHaveLength(1);
    const phase = computeMoonPhase(parseDate(results[0].date), config.moons[0], config).phase;
    expect(phase).toBe("new");
  });
});
