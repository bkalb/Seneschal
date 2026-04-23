import type { ParsedTablePreview } from "@/types/table";
import { inferDiceExpression } from "@/lib/dice/roller";

// "00" on a d100 table means 100
function parseRoll(s: string): number {
  return s === "00" ? 100 : parseInt(s, 10);
}

// A standalone number: not part of dice notation (2d6), not mid-word
// Matches "1", "51", "00" but not "2d6" or "09.02"
const STANDALONE_NUM_RE = /(?<![.\d])(\d{1,3}|00)(?!\d)(?![d.]\d)/g;

// Range rows: "1-5: outcome", "1-5 outcome" (trailing punct or whitespace)
const SINGLE_RANGE = /^(\d{1,3}|00)\s*[-–]\s*(\d{1,3}|00)(?:[.:)\s])\s*(.+)$/;
// Single punctuated: "1. outcome", "1: outcome", "1) outcome"
const SINGLE_NUM = /^(\d{1,3}|00)[.:)]\s*(.+)$/;
// Open-ended "N+" rows: "8+ Storm", "8+: Storm" — max stored as 999 sentinel
const OPEN_ENDED = /^(\d{1,3})\+[.:)±\s\t]\s*(.+)$/;
// Negative single: "-1 Very Hot" (tab or space separator)
const NEGATIVE_NUM = /^(-\d{1,3})[\s\t]+(.+)$/;

// Unordered bullet: "• item", "- item", "* item"
const BULLET = /^[•\-*]\s+(.+)$/;

/**
 * Try to detect and parse two-column numbered lists (common from PDF copy-paste).
 *
 * Pass 1: survey lines with exactly 2 standalone numbers to find the dominant
 * column offset (e.g. second column = first + 50).
 * Pass 2: apply that offset to ALL lines — including those with 3+ numbers
 * (e.g. "6 Bald 56 Mutation (p. 30)" where "30" is a page reference).
 */
function tryTwoColumn(lines: string[]): ParsedTablePreview["rows"] | null {
  type Candidate = { n1: number; text1: string; n2: number; text2: string };

  // --- Pass 1: determine dominant offset from unambiguous (exactly 2-number) lines ---
  const twoNumLines: Array<{ n1: number; n2: number; m1: RegExpMatchArray; m2: RegExpMatchArray; line: string }> = [];

  for (const line of lines) {
    const matches = [...line.matchAll(STANDALONE_NUM_RE)];
    if (matches.length !== 2) continue;
    const [m1, m2] = matches;
    const n1 = parseRoll(m1[1]);
    const n2 = parseRoll(m2[1]);
    if (n1 === n2) continue;
    // Skip lines where the two numbers are joined by a hyphen — that's a range, not two columns
    const between = line.slice(m1.index! + m1[1].length, m2.index!);
    if (/^\s*[-–]\s*$/.test(between)) continue;
    twoNumLines.push({ n1, n2, m1, m2, line });
  }

  if (twoNumLines.length < 3 || twoNumLines.length < lines.length * 0.3) return null;

  const offsetCounts = new Map<number, number>();
  for (const { n1, n2 } of twoNumLines) {
    const off = n2 - n1;
    offsetCounts.set(off, (offsetCounts.get(off) ?? 0) + 1);
  }
  const [[dominantOffset, count]] = [...offsetCounts.entries()].sort((a, b) => b[1] - a[1]);
  if (count < twoNumLines.length * 0.6) return null;

  // --- Pass 2: split ALL lines using the dominant offset ---
  const candidates: Candidate[] = [];

  for (const line of lines) {
    const matches = [...line.matchAll(STANDALONE_NUM_RE)];
    if (matches.length < 2) continue;

    // Find the pair (first_num, some_later_num) that matches the dominant offset
    const m1 = matches[0];
    const n1 = parseRoll(m1[1]);
    const targetN2 = n1 + dominantOffset;

    // Find the match whose value equals n1 + offset (allow ±1 tolerance for edge cases)
    const m2 = matches.slice(1).find((m) => {
      const n = parseRoll(m[1]);
      return Math.abs(n - targetN2) <= 1;
    });

    if (!m2) continue;

    // text1 = between end of first number and start of matched second number
    const text1 = line.slice(m1.index! + m1[1].length, m2.index!).trim();
    // text2 = from end of second number to end of line
    const text2 = line.slice(m2.index! + m2[1].length).trim();

    if (text1.length > 0 && text2.length > 0) {
      candidates.push({ n1, text1, n2: parseRoll(m2[1]), text2 });
    }
  }

  if (candidates.length < 3) return null;

  const rows: ParsedTablePreview["rows"] = [];
  for (const c of candidates) {
    rows.push({ min: c.n1, max: c.n1, outcome: c.text1 });
    rows.push({ min: c.n2, max: c.n2, outcome: c.text2 });
  }
  return rows;
}

export function parsePlaintext(raw: string): ParsedTablePreview {
  const warnings: string[] = [];
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

  // Look for explicit dice expression in any line
  let detectedDiceExpression: string | null = null;
  for (const line of lines) {
    const match = line.match(/\b(\d+d\d+)\b/i);
    if (match) {
      detectedDiceExpression = match[1];
      break;
    }
  }

  const nonHeadingLines = lines.filter((l) => !/^[#_]{1,3}\s/.test(l) && l.length >= 3);

  // --- Attempt two-column detection first ---
  const twoColRows = tryTwoColumn(nonHeadingLines);
  if (twoColRows) {
    twoColRows.sort((a, b) => a.min - b.min);
    const maxValue = Math.max(...twoColRows.map((r) => r.max));
    return {
      detectedDiceExpression: detectedDiceExpression ?? inferDiceExpression(maxValue),
      rows: twoColRows,
      warnings,
    };
  }

  // --- Unordered list ---
  const bulletMatches = nonHeadingLines.filter((l) => BULLET.test(l)).length;
  const isUnordered = bulletMatches >= nonHeadingLines.length * 0.6;

  const tableRows: ParsedTablePreview["rows"] = [];
  let maxValue = 0;        // highest real (non-sentinel) value, for dice expression inference
  let bulletCounter = 1;

  function pushRow(min: number, max: number, outcome: string) {
    const text = outcome.trim();
    if (text) {
      tableRows.push({ min, max, outcome: text });
      // 999 is used as a sentinel for open-ended "N+" rows — don't use it for inference
      if (max < 999) maxValue = Math.max(maxValue, max);
      else maxValue = Math.max(maxValue, min); // use the "N" in "N+" for inference
    }
  }

  for (const line of lines) {
    if (/^[#_]{1,3}\s/.test(line) || line.length < 3) continue;

    if (isUnordered) {
      const m = line.match(BULLET);
      if (m) {
        const n = bulletCounter++;
        pushRow(n, n, m[1]);
      }
      continue;
    }

    // Open-ended "N+" row: "8+ Storm", "8+: Storm" → max = 999 sentinel
    const openMatch = line.match(OPEN_ENDED);
    if (openMatch) {
      const n = parseRoll(openMatch[1]);
      pushRow(n, 999, openMatch[2]);
      continue;
    }

    // Negative single: "-1 Very Hot"
    const negMatch = line.match(NEGATIVE_NUM);
    if (negMatch) {
      const n = parseInt(negMatch[1], 10);
      pushRow(n, n, negMatch[2]);
      continue;
    }

    // Range row: "1-5: outcome" or "1-5 outcome"
    const rangeMatch = line.match(SINGLE_RANGE);
    if (rangeMatch) {
      pushRow(parseRoll(rangeMatch[1]), parseRoll(rangeMatch[2]), rangeMatch[3]);
      continue;
    }

    // Punctuated single: "1. outcome", "1: outcome", "1) outcome"
    const numMatch = line.match(SINGLE_NUM);
    if (numMatch) {
      const n = parseRoll(numMatch[1]);
      pushRow(n, n, numMatch[2]);
      continue;
    }

    // Bare "N text" (no punctuation, tab or space separated) — lowest confidence, try last
    const bareMatch = line.match(/^(\d{1,3}|00)[\s\t]+(.+)$/);
    if (bareMatch) {
      const n = parseRoll(bareMatch[1]);
      pushRow(n, n, bareMatch[2]);
    }
  }

  // Sequential fallback: if nothing matched, treat each non-heading line as a
  // plain-text entry numbered 1, 2, 3… This handles lists like NPC names with
  // no leading numbers or bullets.
  if (tableRows.length === 0) {
    const textLines = lines.filter((l) => !/^[#_]{1,3}\s/.test(l) && l.length >= 2);
    if (textLines.length > 0) {
      textLines.forEach((line, i) => pushRow(i + 1, i + 1, line));
      warnings.push(
        "No row numbers detected — lines numbered sequentially starting at 1."
      );
    } else {
      warnings.push(
        "Could not detect table rows. Expected lines like '1. Outcome', '1-2: Outcome', '• Outcome', or two-column PDF format."
      );
    }
  }

  tableRows.sort((a, b) => a.min - b.min);

  return {
    detectedDiceExpression: detectedDiceExpression ?? inferDiceExpression(maxValue || tableRows.length || 6),
    rows: tableRows,
    warnings,
  };
}
