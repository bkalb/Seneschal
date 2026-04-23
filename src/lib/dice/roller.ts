import type { DiceExpression, DiceRollResult } from "@/types/table";

const DICE_PATTERN = /^(\d+)d(\d+)$/i;

export function parseDiceExpression(raw: string): DiceExpression {
  const match = raw.trim().match(DICE_PATTERN);
  if (!match) throw new Error(`Invalid dice expression: "${raw}"`);
  return { count: parseInt(match[1], 10), sides: parseInt(match[2], 10), raw: raw.trim() };
}

export function rollDice(expr: DiceExpression): DiceRollResult {
  const rolls = Array.from({ length: expr.count }, () =>
    Math.floor(Math.random() * expr.sides) + 1
  );
  return { expression: expr, rolls, total: rolls.reduce((a, b) => a + b, 0) };
}

export function rollExpression(raw: string): DiceRollResult {
  return rollDice(parseDiceExpression(raw));
}

export function isValidDiceExpression(raw: string): boolean {
  return DICE_PATTERN.test(raw.trim());
}

// Infer a dice expression from a maximum range value (e.g. max 8 → "1d8")
export function inferDiceExpression(maxValue: number): string {
  // Always use the exact row count. This avoids a 30-entry list becoming 1d100
  // just because 100 is the next standard die above 20.
  // The dice expression field in the wizard is editable, so the user can
  // override to 1d20, 1d100, etc. after import if desired.
  return `1d${maxValue}`;
}
