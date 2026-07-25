import { describe, it, expect, afterEach, vi } from "vitest";
import type { RandomTable, TableRow, TableModifier } from "@/types/table";
import { rollOnTable } from "@/lib/tables/engine";

function makeRow(overrides: Partial<TableRow>): TableRow {
  return { id: "row", tableId: "table1", min: 1, max: 1, outcome: "Nothing", ...overrides };
}

function makeTable(overrides: Partial<RandomTable> = {}): RandomTable {
  return {
    id: "table1",
    campaignId: "camp1",
    name: "Test Table",
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
      makeRow({ id: "r1", min: 1, max: 10, outcome: "Low" }),
      makeRow({ id: "r2", min: 11, max: 20, outcome: "High" }),
    ],
    modifiers: [],
    regionIds: [],
    ...overrides,
  };
}

// Math.random() = r -> d20 roll = floor(r * 20) + 1.
// r=0    -> 1
// r=0.5  -> 11
// r=0.99 -> 20 (just under 1)
function stubRandom(...values: number[]) {
  const spy = vi.spyOn(Math, "random");
  for (const v of values) spy.mockReturnValueOnce(v);
  return spy;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rollOnTable — row matching", () => {
  it("lands within [min, max] and matches the correct row", () => {
    stubRandom(0.5); // -> 11, should hit r2 "High"
    const result = rollOnTable(makeTable(), null, []);
    expect(result.rawDiceTotal).toBe(11);
    expect(result.matchedRow.id).toBe("r2");
    expect(result.matchedRow.outcome).toBe("High");
  });

  it("matches the exact lower boundary of a row", () => {
    stubRandom(0); // -> 1
    const result = rollOnTable(makeTable(), null, []);
    expect(result.rawDiceTotal).toBe(1);
    expect(result.matchedRow.id).toBe("r1");
  });

  it("matches the exact upper boundary of a row", () => {
    stubRandom(0.5); // -> 11 (boundary of r2)
    const result = rollOnTable(makeTable(), null, []);
    expect(result.matchedRow.id).toBe("r2");
  });

  it("gap between rows: clamps to the nearest row per source (find() falls through to sorted[0]/sorted[last])", () => {
    // Rows with a gap: 1-5 and 10-20; roll of 7 falls in neither.
    const table = makeTable({
      diceExpression: "1d20",
      rows: [makeRow({ id: "low", min: 1, max: 5, outcome: "Low" }), makeRow({ id: "high", min: 10, max: 20, outcome: "High" })],
    });
    // 1d20 with random=0.3 -> floor(0.3*20)+1 = 7, which is in the gap (5,10).
    stubRandom(0.3);
    const result = rollOnTable(table, null, []);
    expect(result.rawDiceTotal).toBe(7);
    // Per source: sorted.find(...) fails, then `diceTotal < sorted[0].min` (7 < 1) is false,
    // so it clamps to the LAST row (sorted[sorted.length - 1]).
    expect(result.matchedRow.id).toBe("high");
  });

  it("a roll below every row's min clamps to the first (lowest) row", () => {
    const table = makeTable({
      rows: [makeRow({ id: "low", min: 5, max: 10, outcome: "Low" }), makeRow({ id: "high", min: 11, max: 20, outcome: "High" })],
    });
    stubRandom(0); // -> 1, below sorted[0].min (5)
    const result = rollOnTable(table, null, []);
    expect(result.rawDiceTotal).toBe(1);
    expect(result.matchedRow.id).toBe("low");
  });
});

describe("rollOnTable — manualModifier", () => {
  it("folds manualModifier into diceTotal while rawDiceTotal stays unmodified", () => {
    stubRandom(0); // -> 1
    const table = makeTable({ manualModifier: 5 });
    const result = rollOnTable(table, null, []);
    expect(result.rawDiceTotal).toBe(1);
    expect(result.diceTotal).toBe(6);
    expect(result.appliedModifiers).toEqual([
      { label: "Manual (+5)", adjustment: 5, source: "user_toggle" },
    ]);
  });

  it("a negative manualModifier is labeled without a leading +", () => {
    stubRandom(0.5); // -> 11
    const table = makeTable({ manualModifier: -3 });
    const result = rollOnTable(table, null, []);
    expect(result.diceTotal).toBe(8);
    expect(result.appliedModifiers[0].label).toBe("Manual (-3)");
  });
});

describe("rollOnTable — modifier adjustments shift the matched row", () => {
  it("an ALWAYS modifier toggled on shifts diceTotal and thus the matched row", () => {
    const mod: TableModifier = {
      id: "m1",
      tableId: "table1",
      label: "+10 bonus",
      behavior: "ALWAYS",
      rollAdjustment: 10,
      extraConfig: null,
      autoRegionIds: [],
      conditionalRegionIds: [],
    };
    const table = makeTable({ modifiers: [mod] });
    stubRandom(0); // rawDiceTotal = 1
    const result = rollOnTable(table, null, ["m1"]);
    expect(result.rawDiceTotal).toBe(1);
    expect(result.diceTotal).toBe(11);
    expect(result.matchedRow.id).toBe("r2"); // 11 falls in High (11-20), not Low
    expect(result.appliedModifiers).toEqual([{ label: "+10 bonus", adjustment: 10, source: "user_toggle" }]);
  });
});

describe("rollOnTable — prerequisite roll", () => {
  it("a passing prerequisite roll proceeds to roll the main table", () => {
    const table = makeTable({ prerequisiteDice: "1d6", prerequisiteMin: 1, prerequisiteMax: 3 });
    // First Math.random() call is the prerequisite (1d6), second is the main table (1d20).
    stubRandom(0, 0.5); // prereq -> 1 (passes 1-3), main -> 11 (High)
    const result = rollOnTable(table, null, []);
    expect(result.prerequisiteRoll).toEqual({ dice: "1d6", result: 1, min: 1, max: 3, passed: true });
    expect(result.matchedRow.id).toBe("r2");
  });

  it("a failing prerequisite roll returns the 'No encounter' path with passed: false and skips the main roll", () => {
    const table = makeTable({ prerequisiteDice: "1d6", prerequisiteMin: 1, prerequisiteMax: 2 });
    const spy = stubRandom(0.9); // prereq (1d6) -> floor(0.9*6)+1 = 6, fails (1-2)
    const result = rollOnTable(table, null, []);
    expect(result.prerequisiteRoll).toEqual({ dice: "1d6", result: 6, min: 1, max: 2, passed: false });
    expect(result.matchedRow.outcome).toBe("No encounter");
    expect(result.resolvedOutcome.expandedText).toBe("No encounter");
    expect(result.rawDiceTotal).toBe(0);
    expect(result.diceTotal).toBe(0);
    // Only one Math.random() call — the main table roll never happened.
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("rollOnTable — invalid diceExpression", () => {
  it("degrades gracefully instead of throwing, returning a sentinel row", () => {
    const table = makeTable({ diceExpression: "garbage" });
    expect(() => rollOnTable(table, null, [])).not.toThrow();
    const result = rollOnTable(table, null, []);
    expect(result.rawDiceTotal).toBe(0);
    expect(result.diceTotal).toBe(0);
    expect(result.matchedRow.outcome).toBe("Invalid dice expression: garbage");
    expect(result.resolvedOutcome.expandedText).toBe("Invalid dice expression: garbage");
  });

  it("an invalid prerequisiteDice also degrades gracefully", () => {
    const table = makeTable({ prerequisiteDice: "garbage", prerequisiteMin: 1, prerequisiteMax: 3 });
    expect(() => rollOnTable(table, null, [])).not.toThrow();
    const result = rollOnTable(table, null, []);
    expect(result.matchedRow.outcome).toBe("Invalid dice expression: garbage");
    expect(result.prerequisiteRoll).toBeUndefined();
  });
});
