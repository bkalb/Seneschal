import { describe, it, expect } from "vitest";
import type { RandomTable, TableModifier } from "@/types/table";
import { resolveModifiers, getVisibleModifiers } from "@/lib/tables/modifier-resolver";

function makeModifier(overrides: Partial<TableModifier>): TableModifier {
  return {
    id: "mod1",
    tableId: "table1",
    label: "Modifier",
    behavior: "ALWAYS",
    rollAdjustment: 1,
    extraConfig: null,
    autoRegionIds: [],
    conditionalRegionIds: [],
    ...overrides,
  };
}

function makeTable(modifiers: TableModifier[], overrides: Partial<RandomTable> = {}): RandomTable {
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
    rows: [],
    modifiers,
    regionIds: [],
    ...overrides,
  };
}

describe("resolveModifiers — ALWAYS", () => {
  it("applies only when the user has toggled it on", () => {
    const mod = makeModifier({ id: "m1", behavior: "ALWAYS", rollAdjustment: 2 });
    const table = makeTable([mod]);

    expect(resolveModifiers(table, null, [])).toEqual([]);
    const applied = resolveModifiers(table, null, ["m1"]);
    expect(applied).toEqual([{ label: "Modifier", adjustment: 2, source: "user_toggle" }]);
  });
});

describe("resolveModifiers — AUTO_REGION", () => {
  it("applies automatically iff currentRegionId is in autoRegionIds, regardless of user toggles", () => {
    const mod = makeModifier({ id: "m1", behavior: "AUTO_REGION", autoRegionIds: ["r1"], rollAdjustment: 3 });
    const table = makeTable([mod]);

    expect(resolveModifiers(table, "r1", [])).toEqual([
      { label: "Modifier", adjustment: 3, source: "auto" },
    ]);
    expect(resolveModifiers(table, "r2", [])).toEqual([]);
    expect(resolveModifiers(table, null, [])).toEqual([]);
    // user toggle is irrelevant for AUTO_REGION
    expect(resolveModifiers(table, "r1", ["m1"])).toEqual([
      { label: "Modifier", adjustment: 3, source: "auto" },
    ]);
  });

  it("is never a user-visible toggle", () => {
    const mod = makeModifier({ id: "m1", behavior: "AUTO_REGION", autoRegionIds: ["r1"] });
    const table = makeTable([mod]);
    expect(getVisibleModifiers(table, "r1")).toEqual([]);
  });
});

describe("resolveModifiers — CONDITIONAL_REGION", () => {
  it("is visible only when region matches", () => {
    const mod = makeModifier({ id: "m1", behavior: "CONDITIONAL_REGION", conditionalRegionIds: ["r1"] });
    const table = makeTable([mod]);
    expect(getVisibleModifiers(table, "r1")).toEqual([mod]);
    expect(getVisibleModifiers(table, "r2")).toEqual([]);
    expect(getVisibleModifiers(table, null)).toEqual([]);
  });

  it("applies only when BOTH region matches AND the user has toggled it", () => {
    const mod = makeModifier({ id: "m1", behavior: "CONDITIONAL_REGION", conditionalRegionIds: ["r1"], rollAdjustment: 5 });
    const table = makeTable([mod]);

    expect(resolveModifiers(table, "r1", [])).toEqual([]); // region matches, not toggled
    expect(resolveModifiers(table, "r2", ["m1"])).toEqual([]); // toggled, region doesn't match
    expect(resolveModifiers(table, null, ["m1"])).toEqual([]); // toggled, no region
    expect(resolveModifiers(table, "r1", ["m1"])).toEqual([
      { label: "Modifier", adjustment: 5, source: "user_toggle" },
    ]);
  });
});

describe("resolveModifiers — PREV_RESULT_CONDITION", () => {
  function makePrevResultTable(operator: "lte" | "gte" | "eq", threshold: number, lastModifiedResult: number | null) {
    const mod = makeModifier({
      id: "m1",
      behavior: "PREV_RESULT_CONDITION",
      rollAdjustment: 4,
      extraConfig: { type: "prev_result_condition", operator, threshold },
    });
    return makeTable([mod], { lastModifiedResult });
  }

  it("lte: applies at and below threshold, not above", () => {
    expect(resolveModifiers(makePrevResultTable("lte", 10, 9), null, [])).toHaveLength(1);
    expect(resolveModifiers(makePrevResultTable("lte", 10, 10), null, [])).toHaveLength(1);
    expect(resolveModifiers(makePrevResultTable("lte", 10, 11), null, [])).toHaveLength(0);
  });

  it("gte: applies at and above threshold, not below", () => {
    expect(resolveModifiers(makePrevResultTable("gte", 10, 9), null, [])).toHaveLength(0);
    expect(resolveModifiers(makePrevResultTable("gte", 10, 10), null, [])).toHaveLength(1);
    expect(resolveModifiers(makePrevResultTable("gte", 10, 11), null, [])).toHaveLength(1);
  });

  it("eq: applies only exactly at threshold", () => {
    expect(resolveModifiers(makePrevResultTable("eq", 10, 9), null, [])).toHaveLength(0);
    expect(resolveModifiers(makePrevResultTable("eq", 10, 10), null, [])).toHaveLength(1);
    expect(resolveModifiers(makePrevResultTable("eq", 10, 11), null, [])).toHaveLength(0);
  });

  it("never applies when lastModifiedResult is null, for any operator", () => {
    expect(resolveModifiers(makePrevResultTable("lte", 10, null), null, [])).toEqual([]);
    expect(resolveModifiers(makePrevResultTable("gte", 10, null), null, [])).toEqual([]);
    expect(resolveModifiers(makePrevResultTable("eq", 10, null), null, [])).toEqual([]);
  });

  it("is not a user toggle and fires with source 'auto'", () => {
    const table = makePrevResultTable("lte", 10, 5);
    expect(getVisibleModifiers(table, null)).toEqual([]);
    expect(resolveModifiers(table, null, [])).toEqual([
      { label: "Modifier", adjustment: 4, source: "auto" },
    ]);
  });
});

describe("resolveModifiers — null region and stacking", () => {
  it("multiple applied modifiers can be summed by the caller", () => {
    const m1 = makeModifier({ id: "m1", behavior: "ALWAYS", rollAdjustment: 2 });
    const m2 = makeModifier({ id: "m2", behavior: "ALWAYS", rollAdjustment: 3, label: "Second" });
    const table = makeTable([m1, m2]);

    const applied = resolveModifiers(table, null, ["m1", "m2"]);
    expect(applied).toHaveLength(2);
    const sum = applied.reduce((s, m) => s + m.adjustment, 0);
    expect(sum).toBe(5);
  });

  it("stacks AUTO_REGION and user-toggled ALWAYS modifiers together", () => {
    const auto = makeModifier({ id: "m1", behavior: "AUTO_REGION", autoRegionIds: ["r1"], rollAdjustment: 2 });
    const always = makeModifier({ id: "m2", behavior: "ALWAYS", rollAdjustment: 3 });
    const table = makeTable([auto, always]);

    const applied = resolveModifiers(table, "r1", ["m2"]);
    expect(applied).toHaveLength(2);
    expect(applied.find((m) => m.source === "auto")?.adjustment).toBe(2);
    expect(applied.find((m) => m.source === "user_toggle")?.adjustment).toBe(3);
  });

  it("with currentRegionId null, only ALWAYS and (inactive) PREV_RESULT_CONDITION-style modifiers can apply", () => {
    const auto = makeModifier({ id: "m1", behavior: "AUTO_REGION", autoRegionIds: ["r1"] });
    const conditional = makeModifier({ id: "m2", behavior: "CONDITIONAL_REGION", conditionalRegionIds: ["r1"] });
    const always = makeModifier({ id: "m3", behavior: "ALWAYS", rollAdjustment: 1 });
    const table = makeTable([auto, conditional, always]);

    const applied = resolveModifiers(table, null, ["m1", "m2", "m3"]);
    expect(applied).toEqual([{ label: "Modifier", adjustment: 1, source: "user_toggle" }]);
  });
});

describe("getVisibleModifiers", () => {
  it("ALWAYS modifiers are always visible regardless of region", () => {
    const mod = makeModifier({ id: "m1", behavior: "ALWAYS" });
    const table = makeTable([mod]);
    expect(getVisibleModifiers(table, null)).toEqual([mod]);
    expect(getVisibleModifiers(table, "any-region")).toEqual([mod]);
  });

  it("PREV_RESULT_CONDITION modifiers are never shown as toggles", () => {
    const mod = makeModifier({
      id: "m1",
      behavior: "PREV_RESULT_CONDITION",
      extraConfig: { type: "prev_result_condition", operator: "gte", threshold: 1 },
    });
    const table = makeTable([mod]);
    expect(getVisibleModifiers(table, null)).toEqual([]);
    expect(getVisibleModifiers(table, "any-region")).toEqual([]);
  });
});
