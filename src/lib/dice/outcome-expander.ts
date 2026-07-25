import type { ResolvedOutcome, InlineRoll } from "@/types/table";
import { rollExpression, DICE_BODY_SOURCE } from "./roller";

// Both scanner patterns are built from roller.ts's DICE_BODY_SOURCE so the
// grammar recognized in outcome text (bare "d20", "d%", "kh"/"kl" suffixes,
// etc.) can never drift from parseDiceExpression's grammar again. The body's
// internal groups are named (count/sides/keepMode/keepCount, see roller.ts)
// specifically so wrapping it here doesn't shift positional group numbers.

// Pattern A — constant ± dice:  "24-1d6", "10+2d4", "24-d6"
// The operator binds the leading integer to the dice expression.
const CONST_OP_DICE = new RegExp(
  String.raw`\b(?<constant>\d+)(?<op>[+-])(?<dice>${DICE_BODY_SOURCE})\b`,
  "gi"
);

// Pattern B — dice ± constant, or bare dice:  "1d6+2", "2d6-1", "1d6",
// "d20", "d%", "4d6kh3", "4d6kl".
// The optional modifier group captures the sign and value together.
const DICE_OP_CONST = new RegExp(
  String.raw`\b(?<dice>${DICE_BODY_SOURCE})(?<modifier>[+-]\d+)?`,
  "gi"
);

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
    const groups = m.groups!;
    const constant = parseInt(groups.constant, 10);
    const op = groups.op as "+" | "-";
    const diceExpr = groups.dice;
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
    const groups = m.groups!;
    const diceExpr = groups.dice;
    const modifierStr = groups.modifier ?? "";
    const fullMatch = diceExpr + modifierStr;
    const start = m.index!;
    candidates.push({
      start,
      end: start + fullMatch.length,
      // Route the full "NdM±K" span through the shared roller in one call so the
      // flat modifier is applied by the single-sourced grammar, not re-parsed here.
      evaluate: () => ({ result: rollExpression(fullMatch).total, notation: fullMatch }),
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
