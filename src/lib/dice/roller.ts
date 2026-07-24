import type { DiceExpression, DiceRollResult } from "@/types/table";

// Grammar (case-insensitive, trimmed first):
//   NdM        — existing
//   dM         — count defaults to 1 (d20 == 1d20)
//   NdM±K      — flat modifier (2d6-1, 1d8+2)
//   d% / Nd%   — % means 100 sides (d% == 1d100)
//   NdMkhX     — keep highest X (kh with no number → keep 1)
//   NdMklX     — keep lowest X (kl with no number → keep 1)
// group1 count (empty → 1), group2 sides ("%" → 100),
// group3 keep mode (kh|kl), group4 keep count (empty → 1), group5 flat modifier
const DICE_PATTERN = /^(\d*)d(\d+|%)(?:(kh|kl)(\d*))?([+-]\d+)?$/i;

const ZERO_EXPRESSION: DiceExpression = { count: 0, sides: 0, raw: "", modifier: 0, keep: null };

export function parseDiceExpression(raw: string): DiceExpression | null {
  const trimmed = raw.trim();
  const match = trimmed.match(DICE_PATTERN);
  if (!match) return null;

  const [, countStr, sidesStr, keepMode, keepCountStr, modifierStr] = match;

  const count = countStr === "" ? 1 : parseInt(countStr, 10);
  const sides = sidesStr === "%" ? 100 : parseInt(sidesStr, 10);
  const modifier = modifierStr ? parseInt(modifierStr, 10) : 0;
  const keep = keepMode
    ? {
        mode: keepMode.toLowerCase() === "kh" ? ("h" as const) : ("l" as const),
        count: keepCountStr ? parseInt(keepCountStr, 10) : 1,
      }
    : null;

  // Guard degenerate input.
  if (!Number.isFinite(count) || !Number.isFinite(sides)) return null;
  if (count < 1 || count > 1000) return null;
  if (sides < 1) return null;

  return { count, sides, raw: trimmed, modifier, keep };
}

export function rollDice(expr: DiceExpression): DiceRollResult {
  const rolls = Array.from({ length: expr.count }, () =>
    Math.floor(Math.random() * expr.sides) + 1
  );

  let kept = rolls;
  if (expr.keep) {
    const keepCount = Math.min(Math.max(expr.keep.count, 1), expr.count);
    const sorted = [...rolls].sort((a, b) => a - b);
    kept = expr.keep.mode === "h" ? sorted.slice(sorted.length - keepCount) : sorted.slice(0, keepCount);
  }

  const total = kept.reduce((a, b) => a + b, 0) + (expr.modifier ?? 0);

  return { expression: expr, rolls, kept, total };
}

export function rollExpression(raw: string): DiceRollResult {
  const expr = parseDiceExpression(raw);
  if (!expr) {
    return { expression: { ...ZERO_EXPRESSION, raw }, rolls: [], kept: [], total: 0 };
  }
  return rollDice(expr);
}

export function isValidDiceExpression(raw: string): boolean {
  return parseDiceExpression(raw) !== null;
}

// Infer a dice expression from a maximum range value (e.g. max 8 → "1d8")
export function inferDiceExpression(maxValue: number): string {
  // Always use the exact row count. This avoids a 30-entry list becoming 1d100
  // just because 100 is the next standard die above 20.
  // The dice expression field in the wizard is editable, so the user can
  // override to 1d20, 1d100, etc. after import if desired.
  return `1d${maxValue}`;
}
