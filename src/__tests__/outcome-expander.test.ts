import { describe, it, expect, afterEach, vi } from "vitest";
import { scanAndRollInlineNotation } from "@/lib/dice/outcome-expander";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("scanAndRollInlineNotation — plain text", () => {
  it("passes plain text through unchanged with empty inlineRolls", () => {
    const result = scanAndRollInlineNotation("A pack of wolves emerges from the tree line.");
    expect(result.rawText).toBe("A pack of wolves emerges from the tree line.");
    expect(result.expandedText).toBe("A pack of wolves emerges from the tree line.");
    expect(result.inlineRolls).toEqual([]);
  });

  it("empty string passes through unchanged", () => {
    const result = scanAndRollInlineNotation("");
    expect(result.expandedText).toBe("");
    expect(result.inlineRolls).toEqual([]);
  });
});

describe("scanAndRollInlineNotation — single notation expansion", () => {
  it("expands '2d6 Bandits' with a matching inlineRolls entry", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // 2d6 -> 1+1 = 2
    const result = scanAndRollInlineNotation("2d6 Bandits");
    expect(result.rawText).toBe("2d6 Bandits");
    expect(result.expandedText).toBe("2 Bandits");
    expect(result.inlineRolls).toEqual([{ notation: "2d6", result: 2 }]);
  });
});

describe("scanAndRollInlineNotation — multiple notations", () => {
  it("expands every notation in a string with multiple occurrences", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // each die -> its minimum
    const result = scanAndRollInlineNotation("1d6 Goblins and 2d4 Wolves");
    expect(result.inlineRolls).toHaveLength(2);
    expect(result.inlineRolls[0]).toEqual({ notation: "1d6", result: 1 });
    expect(result.inlineRolls[1]).toEqual({ notation: "2d4", result: 2 });
    expect(result.expandedText).toBe("1 Goblins and 2 Wolves");
  });
});

describe("scanAndRollInlineNotation — richer Tier 3.3 grammar", () => {
  it("1d6+2 (leading count present) is recognized with its flat modifier", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // 1d6 -> 1, +2 modifier -> 3
    const result = scanAndRollInlineNotation("Deals 1d6+2 damage");
    expect(result.inlineRolls).toEqual([{ notation: "1d6+2", result: 3 }]);
    expect(result.expandedText).toBe("Deals 3 damage");
  });
});

// Helper: makes Math.random return a fixed sequence of values, one per call,
// cycling if exhausted. Used to produce distinguishable dice rolls so kh/kl
// keep semantics can be asserted precisely rather than just bounds-checked.
function mockSequentialRandom(values: number[]) {
  let i = 0;
  return vi.spyOn(Math, "random").mockImplementation(() => {
    const v = values[i % values.length];
    i++;
    return v;
  });
}

describe("scanAndRollInlineNotation — bug fix: grammar single-sourced from roller.ts", () => {
  // outcome-expander.ts's CONST_OP_DICE / DICE_OP_CONST are now built from
  // roller.ts's exported DICE_BODY_SOURCE, so bare `dM`, `d%`, `Nd%`, and the
  // `kh`/`kl` keep suffix are recognized here exactly as parseDiceExpression
  // recognizes them. This replaces the old it.skip("BUG: ...") placeholder.

  it("bare d20 (no leading count) is recognized and rolled", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // 1d20 -> 1
    const result = scanAndRollInlineNotation("Roll d20 to hit");
    expect(result.inlineRolls).toEqual([{ notation: "d20", result: 1 }]);
    expect(result.expandedText).toBe("Roll 1 to hit");
  });

  it("uppercase bare D20 is recognized case-insensitively", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const result = scanAndRollInlineNotation("Roll D20 to hit");
    expect(result.inlineRolls).toEqual([{ notation: "D20", result: 1 }]);
    expect(result.expandedText).toBe("Roll 1 to hit");
  });

  it("bare d% (100 sides, no leading count) is recognized and rolled", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // 1d100 -> 1
    const result = scanAndRollInlineNotation("Roll d% for treasure");
    expect(result.inlineRolls).toEqual([{ notation: "d%", result: 1 }]);
    expect(result.expandedText).toBe("Roll 1 for treasure");
  });

  it("Nd% (explicit count, 100 sides) is recognized and rolled", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // each 1d100 -> 1, summed -> 2
    const result = scanAndRollInlineNotation("Roll 2d% for gold");
    expect(result.inlineRolls).toEqual([{ notation: "2d%", result: 2 }]);
    expect(result.expandedText).toBe("Roll 2 for gold");
  });

  it("4d6kh3 applies keep-highest-3 semantics and leaves no stray 'kh3' in the output", () => {
    // rolls in order: 1, 2, 3, 4 -> kh3 drops the lowest (1) -> kept [2,3,4] -> total 9
    mockSequentialRandom([0, 0.17, 0.34, 0.51]);
    const result = scanAndRollInlineNotation("Stat: 4d6kh3");
    expect(result.inlineRolls).toEqual([{ notation: "4d6kh3", result: 9 }]);
    expect(result.expandedText).toBe("Stat: 9");
    expect(result.expandedText).not.toContain("kh3");
  });

  it("4d6kl2 applies keep-lowest-2 semantics", () => {
    // same rolls [1,2,3,4] -> kl2 keeps the two lowest [1,2] -> total 3
    mockSequentialRandom([0, 0.17, 0.34, 0.51]);
    const result = scanAndRollInlineNotation("Stat: 4d6kl2");
    expect(result.inlineRolls).toEqual([{ notation: "4d6kl2", result: 3 }]);
    expect(result.expandedText).toBe("Stat: 3");
  });

  it("kh with no explicit number defaults to keeping 1", () => {
    // same rolls [1,2,3,4] -> kh (default 1) keeps only the highest [4] -> total 4
    mockSequentialRandom([0, 0.17, 0.34, 0.51]);
    const result = scanAndRollInlineNotation("Stat: 4d6kh");
    expect(result.inlineRolls).toEqual([{ notation: "4d6kh", result: 4 }]);
    expect(result.expandedText).toBe("Stat: 4");
  });

  it("uppercase 4D6KH3 is recognized case-insensitively with the same keep semantics", () => {
    mockSequentialRandom([0, 0.17, 0.34, 0.51]);
    const result = scanAndRollInlineNotation("Stat: 4D6KH3");
    expect(result.inlineRolls).toEqual([{ notation: "4D6KH3", result: 9 }]);
    expect(result.expandedText).toBe("Stat: 9");
    expect(result.expandedText).not.toContain("KH3");
  });
});

describe("scanAndRollInlineNotation — no false positives", () => {
  it("a non-notation token containing 'd' (e.g. 'old') is not mangled", () => {
    const result = scanAndRollInlineNotation("An old wizard stands guard.");
    expect(result.expandedText).toBe("An old wizard stands guard.");
    expect(result.inlineRolls).toEqual([]);
  });

  it("the bare letter 'd' alone is not treated as dice notation", () => {
    const result = scanAndRollInlineNotation("Grade: d");
    expect(result.expandedText).toBe("Grade: d");
    expect(result.inlineRolls).toEqual([]);
  });

  it("mixed real text with a die roll leaves the surrounding words untouched", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const result = scanAndRollInlineNotation("A hidden door requires 1d4 rounds to force open.");
    expect(result.expandedText).toBe("A hidden door requires 1 rounds to force open.");
    expect(result.inlineRolls).toEqual([{ notation: "1d4", result: 1 }]);
  });
});

describe("scanAndRollInlineNotation — no false positives with the widened (bare dM) grammar", () => {
  // Widening the grammar to allow an empty/optional count (so bare "d20"
  // matches) risks matching "d" + digits embedded inside ordinary words.
  // \b does not exist between two word characters, so "d" preceded by
  // another letter/digit with no boundary should never start a match.

  it("'Fred20' (a word ending in a letter immediately followed by 'd20') is not mangled", () => {
    const result = scanAndRollInlineNotation("The wizard Fred20 arrives.");
    expect(result.expandedText).toBe("The wizard Fred20 arrives.");
    expect(result.inlineRolls).toEqual([]);
  });

  it("'ID2' (letter immediately before 'd', digit after) is not mangled", () => {
    const result = scanAndRollInlineNotation("Reference ID2 on the sheet.");
    expect(result.expandedText).toBe("Reference ID2 on the sheet.");
    expect(result.inlineRolls).toEqual([]);
  });

  it("'Round 6' (no 'd' immediately adjacent to the digit) is not mangled", () => {
    const result = scanAndRollInlineNotation("Round 6 begins.");
    expect(result.expandedText).toBe("Round 6 begins.");
    expect(result.inlineRolls).toEqual([]);
  });

  it("a bare 'd' with digits nowhere nearby is not mangled", () => {
    const result = scanAndRollInlineNotation("and so it began");
    expect(result.expandedText).toBe("and so it began");
    expect(result.inlineRolls).toEqual([]);
  });

  it("'50% chance' (a percent with no 'd' present) does not produce a roll", () => {
    const result = scanAndRollInlineNotation("50% chance of rain");
    expect(result.expandedText).toBe("50% chance of rain");
    expect(result.inlineRolls).toEqual([]);
  });

  it("'3d' with no sides digit or '%' after it is not treated as dice notation", () => {
    const result = scanAndRollInlineNotation("Grade: 3d for now");
    expect(result.expandedText).toBe("Grade: 3d for now");
    expect(result.inlineRolls).toEqual([]);
  });
});

describe("scanAndRollInlineNotation — overlap and modifier semantics preserved under the widened grammar", () => {
  it("'24-1d6' still consumes the whole span as one Pattern-A match, no double bare-dice firing", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // 1d6 -> 1
    const result = scanAndRollInlineNotation("HP: 24-1d6");
    expect(result.inlineRolls).toEqual([{ notation: "24-1d6", result: 23 }]);
    expect(result.expandedText).toBe("HP: 23");
  });

  it("'24-d6' (bare dice inside a constant±dice expression) is a single Pattern-A match, not a double fire", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // 1d6 -> 1
    const result = scanAndRollInlineNotation("HP: 24-d6");
    expect(result.inlineRolls).toEqual([{ notation: "24-d6", result: 23 }]);
    expect(result.expandedText).toBe("HP: 23");
  });

  it("'2d6-1' consumes the whole span as one roll with the flat modifier applied by the roller", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // 2d6 -> 1+1=2, -1 modifier -> 1
    const result = scanAndRollInlineNotation("Damage: 2d6-1");
    expect(result.inlineRolls).toEqual([{ notation: "2d6-1", result: 1 }]);
    expect(result.expandedText).toBe("Damage: 1");
  });

  it("PINNED pre-existing (out of scope) behavior: '1d6+2d4' matches only '1d6+2', leaving 'd4' dangling unrolled", () => {
    // This is the documented, unchanged quirk: the scanner does not treat
    // "+2d4" as a second independent dice term once "+2" has already been
    // consumed as a flat modifier on "1d6". Fixing this is explicitly out of
    // scope for this change; this test only pins the current behavior so a
    // future change to it is a deliberate, visible decision.
    vi.spyOn(Math, "random").mockReturnValue(0); // 1d6 -> 1, +2 modifier -> 3
    const result = scanAndRollInlineNotation("Deals 1d6+2d4 damage");
    expect(result.inlineRolls).toEqual([{ notation: "1d6+2", result: 3 }]);
    expect(result.expandedText).toBe("Deals 3d4 damage");
  });
});

describe("scanAndRollInlineNotation — constant ± dice (pattern A)", () => {
  it("expands '24-1d6' as constant minus a dice roll", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // 1d6 -> 1
    const result = scanAndRollInlineNotation("HP: 24-1d6");
    expect(result.inlineRolls).toEqual([{ notation: "24-1d6", result: 23 }]);
    expect(result.expandedText).toBe("HP: 23");
  });

  it("does not double-fire the bare-dice pattern inside a constant±dice match", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const result = scanAndRollInlineNotation("10+2d4");
    // Only one inline roll should be recorded — the "10+2d4" pattern-A match —
    // not also a separate bare "2d4" pattern-B match.
    expect(result.inlineRolls).toHaveLength(1);
    expect(result.inlineRolls[0].notation).toBe("10+2d4");
  });
});
