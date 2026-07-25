import { describe, it, expect, afterEach, vi } from "vitest";
import type { RandomTable, TableRow } from "@/types/table";
import type { EncounterWindow } from "@/lib/encounter-timing";
import {
  lookupOutcomeByRoll,
  rollEncounterForWindows,
  rollEncounterFull,
} from "@/lib/tables/encounter-roll";

function makeRow(overrides: Partial<TableRow>): TableRow {
  return { id: "row", tableId: "table1", min: 1, max: 1, outcome: "Nothing", ...overrides };
}

function makeTable(overrides: Partial<RandomTable> = {}): RandomTable {
  return {
    id: "table1",
    campaignId: "camp1",
    name: "Encounter Table",
    category: "ENCOUNTER",
    diceExpression: "1d20",
    isStateful: false,
    lastResult: null,
    lastModifiedResult: null,
    forecastResult: null,
    forecastModifiedResult: null,
    forecastDate: null,
    forecastOutcome: null,
    rollOnDayAdvance: false,
    seasonName: null,
    rollWhenNoSeason: "always",
    manualModifier: 0,
    surpriseDice: null,
    surpriseThreshold: null,
    npcForType: null,
    npcForGender: null,
    applicableModes: "BOTH",
    sortOrder: 0,
    prerequisiteDice: null,
    prerequisiteMin: null,
    prerequisiteMax: null,
    rows: [
      makeRow({ id: "r1", min: 1, max: 10, outcome: "Wolves" }),
      makeRow({ id: "r2", min: 11, max: 20, outcome: "Bandits" }),
    ],
    modifiers: [],
    regionIds: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lookupOutcomeByRoll", () => {
  const table = makeTable();

  it("returns the outcome of the row containing the roll", () => {
    expect(lookupOutcomeByRoll(5, table)).toBe("Wolves");
    expect(lookupOutcomeByRoll(15, table)).toBe("Bandits");
  });

  it("hits both boundaries of a row", () => {
    expect(lookupOutcomeByRoll(1, table)).toBe("Wolves");
    expect(lookupOutcomeByRoll(10, table)).toBe("Wolves");
    expect(lookupOutcomeByRoll(11, table)).toBe("Bandits");
    expect(lookupOutcomeByRoll(20, table)).toBe("Bandits");
  });

  it("out-of-range falls back to the first row's outcome", () => {
    expect(lookupOutcomeByRoll(999, table)).toBe("Wolves");
    expect(lookupOutcomeByRoll(0, table)).toBe("Wolves");
  });

  it("falls back to the em dash when the table has no rows at all", () => {
    const empty = makeTable({ rows: [] });
    expect(lookupOutcomeByRoll(5, empty)).toBe("—");
  });
});

describe("rollEncounterForWindows", () => {
  const table = makeTable();

  it("0 windows falls back to the legacy Day/Night pair with null time", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const results = rollEncounterForWindows([], { table, reactionTable: null, regionId: null });
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.label)).toEqual(["Day", "Night"]);
    expect(results.every((r) => r.time === null)).toBe(true);
  });

  it("1 window produces exactly 1 result with that window's name and a non-null time", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const windows: EncounterWindow[] = [
      { name: "Dusk", startHour: 18, startMinute: 0, endHour: 20, endMinute: 0 },
    ];
    const results = rollEncounterForWindows(windows, { table, reactionTable: null, regionId: null });
    expect(results).toHaveLength(1);
    expect(results[0].label).toBe("Dusk");
    expect(typeof results[0].time).toBe("string");
  });

  it("2 windows produce 2 results, in the same order as the input windows", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const windows: EncounterWindow[] = [
      { name: "Morning", startHour: 6, startMinute: 0, endHour: 12, endMinute: 0 },
      { name: "Evening", startHour: 18, startMinute: 0, endHour: 22, endMinute: 0 },
    ];
    const results = rollEncounterForWindows(windows, { table, reactionTable: null, regionId: null });
    expect(results.map((r) => r.label)).toEqual(["Morning", "Evening"]);
  });

  it("4 windows produce 4 results, in order", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const windows: EncounterWindow[] = [
      { name: "Dawn", startHour: 5, startMinute: 0, endHour: 7, endMinute: 0 },
      { name: "Midday", startHour: 11, startMinute: 0, endHour: 13, endMinute: 0 },
      { name: "Dusk", startHour: 18, startMinute: 0, endHour: 20, endMinute: 0 },
      { name: "Night", startHour: 22, startMinute: 0, endHour: 4, endMinute: 0 }, // midnight-wrapping
    ];
    const results = rollEncounterForWindows(windows, { table, reactionTable: null, regionId: null });
    expect(results.map((r) => r.label)).toEqual(["Dawn", "Midday", "Dusk", "Night"]);
    expect(results.every((r) => typeof r.time === "string")).toBe(true);
  });
});

describe("rollEncounterFull — surprise resolution", () => {
  it("table-level surpriseDice/threshold take precedence over campaign defaults", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // main roll -> 1; surprise roll -> lowest
    const table = makeTable({ surpriseDice: "1d6", surpriseThreshold: 2 });
    const result = rollEncounterFull({
      table,
      reactionTable: null,
      regionId: null,
      campaignDefaultSurpriseDice: "1d20",
      campaignDefaultSurpriseThreshold: 15,
    });
    expect(result.surprise).not.toBeNull();
    expect(result.surprise!.dice).toBe("1d6");
    expect(result.surprise!.threshold).toBe(2);
  });

  it("falls back to campaign defaults when the table has no surprise config", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const table = makeTable({ surpriseDice: null, surpriseThreshold: null });
    const result = rollEncounterFull({
      table,
      reactionTable: null,
      regionId: null,
      campaignDefaultSurpriseDice: "1d20",
      campaignDefaultSurpriseThreshold: 15,
    });
    expect(result.surprise).not.toBeNull();
    expect(result.surprise!.dice).toBe("1d20");
    expect(result.surprise!.threshold).toBe(15);
  });

  it("surprise is null when neither table nor campaign provide a surprise config", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const table = makeTable({ surpriseDice: null, surpriseThreshold: null });
    const result = rollEncounterFull({ table, reactionTable: null, regionId: null });
    expect(result.surprise).toBeNull();
  });

  it("surprise is null when only the threshold is missing (dice alone is not enough)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const table = makeTable({ surpriseDice: "1d6", surpriseThreshold: null });
    const result = rollEncounterFull({ table, reactionTable: null, regionId: null });
    expect(result.surprise).toBeNull();
  });
});

describe("rollEncounterFull — reaction", () => {
  it("reactionTable null yields reaction: null", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const table = makeTable();
    const result = rollEncounterFull({ table, reactionTable: null, regionId: null });
    expect(result.reaction).toBeNull();
  });

  it("a provided reactionTable populates reaction with its name, roll, and resolved outcome", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // both rolls -> lowest
    const table = makeTable();
    const reactionTable = makeTable({
      id: "reaction1",
      name: "Reaction Table",
      rows: [makeRow({ id: "rr1", min: 1, max: 20, outcome: "Hostile" })],
    });
    const result = rollEncounterFull({ table, reactionTable, regionId: null });
    expect(result.reaction).toEqual({ tableName: "Reaction Table", roll: 1, outcome: "Hostile" });
  });
});

describe("rollEncounterFull — prerequisite failure short-circuits reaction/surprise/subRolls", () => {
  it("a failed prerequisite roll returns null reaction, null surprise, and empty subRolls", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // prereq (1d6) -> 6, fails against [1,2]
    const table = makeTable({ prerequisiteDice: "1d6", prerequisiteMin: 1, prerequisiteMax: 2 });
    const reactionTable = makeTable({ id: "reaction1", name: "Reaction" });
    const result = rollEncounterFull({
      table,
      reactionTable,
      regionId: null,
      campaignDefaultSurpriseDice: "1d20",
      campaignDefaultSurpriseThreshold: 10,
    });
    expect(result.prerequisiteRoll?.passed).toBe(false);
    expect(result.reaction).toBeNull();
    expect(result.surprise).toBeNull();
    expect(result.subRolls).toEqual([]);
  });
});
