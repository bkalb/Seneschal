import { rollExpression } from "@/lib/dice/roller";
import { scanAndRollInlineNotation } from "@/lib/dice/outcome-expander";
import type { TableRow } from "@/types/table";

/**
 * Default number of sub-rolls for a "for each X" instruction that doesn't
 * specify an explicit count (e.g. "roll a d20 for each side"). Two combatant
 * sides is the common case in most encounter rulesets.
 */
const DEFAULT_FOR_EACH_COUNT = 2;

/** Clamp a derived "for each" count to a sane range, guarding against a pathological "for each 999". */
const MIN_FOR_EACH_COUNT = 1;
const MAX_FOR_EACH_COUNT = 20;
function clampForEachCount(n: number): number {
  return Math.min(MAX_FOR_EACH_COUNT, Math.max(MIN_FOR_EACH_COUNT, n));
}

export interface SubRollEntry {
  roll: number;
  outcome: string;        // raw outcome text
  expandedOutcome: string; // outcome with inline dice rolled and substituted
  inlineRolls: { notation: string; result: number }[];
}

export interface SubRoll {
  // The die notation that was detected, e.g. "d20"
  notation: string;
  // Human-readable label for why there are multiple rolls, e.g. "each side"
  // null when there is only one roll
  label: string | null;
  results: SubRollEntry[];
}

/**
 * Patterns we recognise as sub-roll instructions, in priority order.
 *
 * Each entry describes:
 *   pattern  — regex run against the outcome text (global, case-insensitive)
 *   die      — capture group index for the die size (e.g. "20" from "d20")
 *   count    — number of times to roll; a function receiving the full match
 *              so rule-specific multipliers can be detected
 *   label    — short string shown in the UI, or null for single rolls
 *
 * To support a new ruleset, append entries here.
 * Patterns are tried in order; the first match per occurrence wins.
 */
const SUB_ROLL_PATTERNS: Array<{
  pattern: RegExp;
  dieGroup: number;
  count: (match: RegExpMatchArray) => number;
  label: (match: RegExpMatchArray) => string | null;
}> = [
  // "roll a d20 for each side" / "roll 1d20 for each side"
  // "roll a d6 for each group" / "roll dN for each X"
  // "roll a d6 for each of the 3 groups" — an explicit leading integer in the
  // "each" clause overrides the DEFAULT_FOR_EACH_COUNT fallback.
  {
    pattern: /\broll(?:\s+(?:a|\d+))?\s*d(\d+)\s+for\s+each\s+(?:of\s+(?:the\s+)?)?(\d+)?\s*(\w+)/gi,
    dieGroup: 1,
    count: (m) => {
      const explicitCount = m[2] ? parseInt(m[2], 10) : NaN;
      return clampForEachCount(isNaN(explicitCount) ? DEFAULT_FOR_EACH_COUNT : explicitCount);
    },
    label: (m) => `each ${m[2] ? `${m[2]} ` : ""}${m[3]}`, // e.g. "each side" or "each 3 groups"
  },

  // "roll a d20" / "roll 1d20" / "roll d20"
  {
    pattern: /\broll(?:\s+(?:a|\d+))?\s*d(\d+)/gi,
    dieGroup: 1,
    count: () => 1,
    label: () => null,
  },
];

/**
 * Look up the row whose range covers `roll` among the provided rows.
 * Falls back to the closest row if none match exactly (shouldn't happen for
 * well-formed tables but protects against edge cases).
 */
function lookupRow(roll: number, rows: TableRow[]): string {
  // Filter to rows whose max is at most the die size so we don't accidentally
  // hit high-range rows when rolling a smaller die on a large table.
  // Actually we just do a normal range lookup — rolling d20 on a d100 table
  // naturally hits whichever row covers [1..20].
  const match = rows.find((r) => r.min <= roll && r.max >= roll);
  if (match) return match.outcome;
  // Fallback: nearest row
  const sorted = rows.slice().sort((a, b) => Math.abs(a.min - roll) - Math.abs(b.min - roll));
  return sorted[0]?.outcome ?? "—";
}

/**
 * Scan `text` for sub-roll instructions and execute them against `rows`.
 * Returns one SubRoll per distinct instruction found in the text.
 *
 * This is intentionally open-ended: adding a new pattern to SUB_ROLL_PATTERNS
 * is all that's needed to support a new ruleset.
 */
export function detectAndResolveSubRolls(text: string, rows: TableRow[]): SubRoll[] {
  // Collect every match from every pattern together with its source spec and
  // character range. We'll process them in order and skip overlaps so that a
  // more-specific pattern (e.g. "for each side") doesn't also trigger the
  // less-specific one that is its prefix (e.g. bare "roll a d20").
  const candidates: Array<{
    start: number;
    end: number;
    sides: number;
    count: number;
    label: string | null;
  }> = [];

  for (const spec of SUB_ROLL_PATTERNS) {
    spec.pattern.lastIndex = 0;
    let match: RegExpMatchArray | null;
    while ((match = spec.pattern.exec(text)) !== null) {
      const sides = parseInt(match[spec.dieGroup], 10);
      if (!sides || isNaN(sides)) continue;
      candidates.push({
        start: match.index!,
        end: match.index! + match[0].length,
        sides,
        count: spec.count(match),
        label: spec.label(match),
      });
    }
  }

  // Sort by start position so earlier (and therefore higher-priority) matches
  // are processed first.
  candidates.sort((a, b) => a.start - b.start);

  const subRolls: SubRoll[] = [];
  let consumed = -1; // rightmost end index of any accepted match

  for (const c of candidates) {
    // Skip if this match overlaps a previously accepted one.
    if (c.start < consumed) continue;
    consumed = c.end;

    const notation = `d${c.sides}`;
    const results: SubRollEntry[] = [];
    for (let i = 0; i < c.count; i++) {
      const rolled = rollExpression(`1d${c.sides}`);
      const rawOutcome = lookupRow(rolled.total, rows);
      const resolved = scanAndRollInlineNotation(rawOutcome);
      results.push({
        roll: rolled.total,
        outcome: rawOutcome,
        expandedOutcome: resolved.expandedText,
        inlineRolls: resolved.inlineRolls,
      });
    }
    subRolls.push({ notation, label: c.label, results });
  }

  return subRolls;
}
