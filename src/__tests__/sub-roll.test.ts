import { describe, it, expect, afterEach, vi } from "vitest";
import { detectAndResolveSubRolls } from "@/lib/tables/sub-roll";
import type { TableRow } from "@/types/table";

afterEach(() => {
  vi.restoreAllMocks();
});

const rows: TableRow[] = [
  { id: "r1", tableId: "t1", min: 1, max: 3, outcome: "Goblins" },
  { id: "r2", tableId: "t1", min: 4, max: 6, outcome: "Orcs" },
];

// Makes Math.random return a fixed sequence of values, one per call, cycling
// if exhausted. Mirrors the helper in outcome-expander.test.ts.
function mockSequentialRandom(values: number[]) {
  let i = 0;
  return vi.spyOn(Math, "random").mockImplementation(() => {
    const v = values[i % values.length];
    i++;
    return v;
  });
}

describe("detectAndResolveSubRolls", () => {
  it("derives an explicit count from 'for each of the N X' phrasing", () => {
    const subRolls = detectAndResolveSubRolls("roll a d6 for each of the 3 groups", rows);
    expect(subRolls).toHaveLength(1);
    expect(subRolls[0].notation).toBe("d6");
    expect(subRolls[0].results).toHaveLength(3);
    expect(subRolls[0].label).toBe("each 3 groups");
  });

  it("falls back to DEFAULT_FOR_EACH_COUNT (2) for 'for each side' with no number", () => {
    const subRolls = detectAndResolveSubRolls("roll a d20 for each side", rows);
    expect(subRolls).toHaveLength(1);
    expect(subRolls[0].notation).toBe("d20");
    expect(subRolls[0].results).toHaveLength(2);
    expect(subRolls[0].label).toBe("each side");
  });

  it("clamps a pathological explicit count to the [1, 20] range", () => {
    const subRolls = detectAndResolveSubRolls("roll a d6 for each of the 999 groups", rows);
    expect(subRolls).toHaveLength(1);
    expect(subRolls[0].results).toHaveLength(20);
  });

  it("still handles a bare 'roll dN' with a single roll and no label", () => {
    const subRolls = detectAndResolveSubRolls("roll a d20", rows);
    expect(subRolls).toHaveLength(1);
    expect(subRolls[0].notation).toBe("d20");
    expect(subRolls[0].results).toHaveLength(1);
    expect(subRolls[0].label).toBeNull();
  });
});

describe("detectAndResolveSubRolls — bug fix: grammar single-sourced from roller.ts", () => {
  // sub-roll.ts's SUB_ROLL_PATTERNS are now built from roller.ts's exported
  // DICE_BODY_SOURCE, the same source outcome-expander.ts and
  // parseDiceExpression use. This exercises the notation forms that were
  // previously unreachable (d%, kh/kl) and the real behavioral bug: the old
  // code extracted only the die's sides and discarded count/keep-modifiers,
  // so "roll 2d6 for each side" silently rolled 1d6 per side instead of 2d6.

  it("recognizes 'roll d% for each side' (percentile notation, previously unsupported)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // 1d100 -> 1
    const subRolls = detectAndResolveSubRolls("roll d% for each side", rows);
    expect(subRolls).toHaveLength(1);
    expect(subRolls[0].notation).toBe("d%");
    expect(subRolls[0].label).toBe("each side");
    expect(subRolls[0].results).toHaveLength(2); // DEFAULT_FOR_EACH_COUNT
    for (const r of subRolls[0].results) {
      expect(r.roll).toBe(1);
    }
  });

  it("recognizes 'roll 4d6kh3' (keep-highest-3) and applies the keep semantics rather than a bare d6", () => {
    // rolls in order: 1, 2, 3, 4 -> kh3 drops the lowest (1) -> kept [2,3,4] -> total 9
    mockSequentialRandom([0, 0.17, 0.34, 0.51]);
    const subRolls = detectAndResolveSubRolls("roll 4d6kh3", rows);
    expect(subRolls).toHaveLength(1);
    expect(subRolls[0].notation).toBe("4d6kh3");
    expect(subRolls[0].label).toBeNull();
    expect(subRolls[0].results).toHaveLength(1);
    // 9 is unreachable by a single 1d6 roll (max 6) — proves count/keep
    // weren't discarded the way the pre-fix code discarded them.
    expect(subRolls[0].results[0].roll).toBe(9);
  });

  it("'roll 2d6 for each of the 3 groups' actually rolls 2d6 per group, not 1d6", () => {
    // Force every individual d6 to its maximum (6) so a correctly-summed 2d6
    // roll totals 12 — a value 1d6 (max 6) could never produce. This is the
    // exact regression the fix targets: sub-roll.ts used to reconstruct
    // `1d${sides}` and throw away the leading count entirely.
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    const subRolls = detectAndResolveSubRolls("roll 2d6 for each of the 3 groups", rows);
    expect(subRolls).toHaveLength(1);
    expect(subRolls[0].notation).toBe("2d6");
    expect(subRolls[0].label).toBe("each 3 groups");
    expect(subRolls[0].results).toHaveLength(3);
    for (const r of subRolls[0].results) {
      expect(r.roll).toBe(12);
      expect(r.roll).toBeGreaterThan(6); // outside 1d6's range — proves both dice were rolled
    }
  });
});

describe("detectAndResolveSubRolls — no false positives", () => {
  // None of these contain the literal word "roll" immediately before a dice
  // token, so none should produce a sub-roll. Corpus mirrors
  // outcome-expander.test.ts's false-positive cases.
  const negativeCases = [
    "Fred20 stands guard.",
    "Reference ID2 on the sheet.",
    "Round 6 begins.",
    "Grade: d",
    "Grade: 3d for now",
    "50% chance of rain",
  ];

  it.each(negativeCases)("produces no sub-rolls for %j", (text) => {
    const subRolls = detectAndResolveSubRolls(text, rows);
    expect(subRolls).toEqual([]);
  });
});
