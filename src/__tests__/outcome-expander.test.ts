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
  // The inline-notation regexes here (CONST_OP_DICE / DICE_OP_CONST in
  // outcome-expander.ts) both require an explicit leading count digit before
  // "d" (`\d+d\d+`) and have no kh/kl suffix support at all — a narrower
  // grammar than roller.ts's parseDiceExpression, which accepts bare `dM`,
  // `d%`, and `kh`/`kl`. Document the ACTUAL (narrower) behavior here.

  it("current behavior: 1d6+2 (leading count present) IS recognized with its flat modifier", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // 1d6 -> 1, +2 modifier -> 3
    const result = scanAndRollInlineNotation("Deals 1d6+2 damage");
    expect(result.inlineRolls).toEqual([{ notation: "1d6+2", result: 3 }]);
    expect(result.expandedText).toBe("Deals 3 damage");
  });

  it("current behavior: bare d% (no leading count) is NOT recognized and passes through unrolled", () => {
    const result = scanAndRollInlineNotation("Roll d% for treasure");
    expect(result.inlineRolls).toEqual([]);
    expect(result.expandedText).toBe("Roll d% for treasure");
  });

  it("current behavior: bare d20 (no leading count) is NOT recognized and passes through unrolled", () => {
    const result = scanAndRollInlineNotation("Roll d20 to hit");
    expect(result.inlineRolls).toEqual([]);
    expect(result.expandedText).toBe("Roll d20 to hit");
  });

  it("current behavior: 4d6kh3's kh3 suffix is ignored — only the bare '4d6' prefix is matched and rolled without keep-highest", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // all 4 dice -> 1 each, summed (not kept-3) -> 4
    const result = scanAndRollInlineNotation("Stat: 4d6kh3");
    expect(result.inlineRolls).toEqual([{ notation: "4d6", result: 4 }]);
    expect(result.expandedText).toBe("Stat: 4kh3");
  });

  // BUG: per the T4.4 spec and roller.ts's full dice grammar, inline outcome
  // text should recognize bare `dM` (e.g. "d20"), `d%`, and the `kh`/`kl`
  // keep-highest/lowest suffix, the same as parseDiceExpression does. Actual:
  // CONST_OP_DICE and DICE_OP_CONST in outcome-expander.ts both hard-require
  // a leading digit count (`\d+d\d+`) and never look for a trailing
  // `kh`/`kl` group, so "d20", "d%", and the "kh3" in "4d6kh3" are silently
  // dropped/ignored instead of rolled per the full grammar.
  it.skip("BUG: bare d20, d%, and kh/kl suffixes should be recognized like parseDiceExpression's grammar", () => {
    const d20 = scanAndRollInlineNotation("Roll d20 to hit");
    expect(d20.inlineRolls).toEqual([{ notation: "d20", result: expect.any(Number) }]);

    const pct = scanAndRollInlineNotation("Roll d% for treasure");
    expect(pct.inlineRolls).toEqual([{ notation: "d%", result: expect.any(Number) }]);

    const kh = scanAndRollInlineNotation("Stat: 4d6kh3");
    expect(kh.inlineRolls).toEqual([{ notation: "4d6kh3", result: expect.any(Number) }]);
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
