import type { ResolvedOutcome, InlineRoll } from "@/types/table";
import { rollExpression } from "./roller";

// Pattern A — constant ± dice:  "24-1d6", "10+2d4"
// The operator binds the leading integer to the dice expression.
const CONST_OP_DICE = /\b(\d+)([+-])(\d+d\d+)\b/gi;

// Pattern B — dice ± constant, or bare dice:  "1d6+2", "2d6-1", "1d6"
// The optional modifier group captures the sign and value together.
const DICE_OP_CONST = /\b(\d+d\d+)([+-]\d+)?/gi;

interface Candidate {
  start: number;
  end: number;
  // Called exactly once to produce the roll result and display notation.
  evaluate: () => { result: number; notation: string };
}

export function scanAndRollInlineNotation(text: string): ResolvedOutcome {
  const candidates: Candidate[] = [];

  // Collect pattern-A matches (constant ± dice)
  CONST_OP_DICE.lastIndex = 0;
  let m: RegExpMatchArray | null;
  while ((m = CONST_OP_DICE.exec(text)) !== null) {
    const constant = parseInt(m[1], 10);
    const op = m[2] as "+" | "-";
    const diceExpr = m[3];
    const fullMatch = m[0];
    const start = m.index!;
    candidates.push({
      start,
      end: start + fullMatch.length,
      evaluate: () => {
        const rolled = rollExpression(diceExpr).total;
        const result = op === "+" ? constant + rolled : constant - rolled;
        return { result, notation: fullMatch };
      },
    });
  }

  // Collect pattern-B matches (dice ± constant, or bare dice)
  DICE_OP_CONST.lastIndex = 0;
  while ((m = DICE_OP_CONST.exec(text)) !== null) {
    const diceExpr = m[1];
    const modifierStr = m[2] ?? "";
    const fullMatch = diceExpr + modifierStr;
    const start = m.index!;
    candidates.push({
      start,
      end: start + fullMatch.length,
      evaluate: () => {
        const rolled = rollExpression(diceExpr).total;
        const modifier = modifierStr ? parseInt(modifierStr, 10) : 0;
        return { result: rolled + modifier, notation: fullMatch };
      },
    });
  }

  // Sort by start position; pattern-A matches win ties because they were
  // pushed first and Array.sort is stable.
  candidates.sort((a, b) => a.start - b.start);

  // Accept each candidate only if it doesn't overlap a previously accepted one.
  // This prevents a bare "1d6" match from also firing inside "24-1d6".
  const accepted: Candidate[] = [];
  let consumed = -1;
  for (const c of candidates) {
    if (c.start < consumed) continue;
    accepted.push(c);
    consumed = c.end;
  }

  // Evaluate all accepted matches (produces actual dice rolls).
  const evaluated = accepted.map((c) => ({ ...c, ...c.evaluate() }));

  // Build inline-rolls list (left-to-right for display).
  const inlineRolls: InlineRoll[] = evaluated.map(({ notation, result }) => ({
    notation,
    result,
  }));

  // Substitute right-to-left to preserve earlier indices.
  let expandedText = text;
  for (let i = evaluated.length - 1; i >= 0; i--) {
    const { start, end, result } = evaluated[i];
    expandedText =
      expandedText.slice(0, start) +
      String(result) +
      expandedText.slice(end);
  }

  return { rawText: text, expandedText, inlineRolls };
}
