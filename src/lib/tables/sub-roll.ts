import { rollExpression, parseDiceExpression, DICE_BODY_SOURCE } from "@/lib/dice/roller";
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
 *   pattern  — regex run against the outcome text (global, case-insensitive).
 *              The die notation itself is composed from roller.ts's
 *              DICE_BODY_SOURCE (wrapped in a named `dice` group) so this
 *              file never re-derives the dice grammar — see outcome-expander.ts
 *              for the sibling that established the pattern.
 *   count    — number of times to roll; a function receiving the full match
 *              so rule-specific multipliers can be detected
 *   label    — short string shown in the UI, or null for single rolls
 *
 * To support a new ruleset, append entries here.
 * Patterns are tried in order; the first match per occurrence wins.
 *
 * Note: the leading "roll" prefix only tolerates an optional bare "a"
 * (`roll a d20`), not a leading integer (`roll 1d20`) — DICE_BODY_SOURCE's
 * own `(?<count>\d*)` group is what captures a leading count, and it must be
 * given first crack at any digits immediately before the "d". Letting the
 * prefix greedily eat digits too (as a naive `(?:\s+(?:a|\d+))?` would)
 * strips the count off notations like "roll 4d6kh3" before the dice group
 * ever sees it, silently downgrading them to 1dN.
 */
const SUB_ROLL_PATTERNS: Array<{
  pattern: RegExp;
  count: (match: RegExpMatchArray) => number;
  label: (match: RegExpMatchArray) => string | null;
}> = [
  // "roll a d20 for each side" / "roll 1d20 for each side"
  // "roll a d6 for each group" / "roll dN for each X"
  // "roll a d6 for each of the 3 groups" — an explicit leading integer in the
  // "each" clause overrides the DEFAULT_FOR_EACH_COUNT fallback.
  {
    pattern: new RegExp(
      String.raw`\broll(?:\s+a)?\s*(?<dice>${DICE_BODY_SOURCE})\s+for\s+each\s+(?:of\s+(?:the\s+)?)?(?<eachCount>\d+)?\s*(?<eachNoun>\w+)`,
      "gi"
    ),
    count: (m) => {
      const explicitCount = m.groups!.eachCount ? parseInt(m.groups!.eachCount, 10) : NaN;
      return clampForEachCount(isNaN(explicitCount) ? DEFAULT_FOR_EACH_COUNT : explicitCount);
    },
    label: (m) => `each ${m.groups!.eachCount ? `${m.groups!.eachCount} ` : ""}${m.groups!.eachNoun}`, // e.g. "each side" or "each 3 groups"
  },

  // "roll a d20" / "roll 1d20" / "roll d20" / "roll d%" / "roll 4d6kh3"
  {
    pattern: new RegExp(String.raw`\broll(?:\s+a)?\s*(?<dice>${DICE_BODY_SOURCE})`, "gi"),
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
    notation: string;
    count: number;
    label: string | null;
  }> = [];

  for (const spec of SUB_ROLL_PATTERNS) {
    spec.pattern.lastIndex = 0;
    let match: RegExpMatchArray | null;
    while ((match = spec.pattern.exec(text)) !== null) {
      const notation = match.groups!.dice;
      // Validate against the shared grammar rather than trusting the regex
      // match alone — skip anything that doesn't actually parse (shouldn't
      // happen given DICE_BODY_SOURCE is the same source parseDiceExpression
      // uses, but keeps the two from silently diverging in the future).
      if (!parseDiceExpression(notation)) continue;
      candidates.push({
        start: match.index!,
        end: match.index! + match[0].length,
        notation,
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

    const notation = c.notation;
    const results: SubRollEntry[] = [];
    for (let i = 0; i < c.count; i++) {
      const rolled = rollExpression(notation);
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
