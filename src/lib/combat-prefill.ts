
export interface CombatantInfo {
  name: string;
  count: number;
}

/**
 * Given an encounter outcome string, attempts to extract a creature count and
 * name suitable for prefilling the Add Side form.
 *
 * Handles:
 *  - Leading count:       "5 Bandits" → { count: 5, name: "Bandit" }
 *  - Bracket prefixes:    "[If within 2 hexes of 09.02] 3 Gnolls." → { count: 3, name: "Gnoll" }
 *  - Mid-string "and N":  "Merchant Carriage and 8 guards." → { count: 8, name: "Guard" }
 *  - Inline dice result:  "Herd of deer, 2-in-6 stalked by 11 hungry wolves" → { count: 11, name: "Hungry wolf" }
 *
 * The returned name has trailing punctuation stripped, singularized, and its
 * first letter capitalized.
 */
export function extractCombatantInfo(text: string): CombatantInfo | null {
  // Strip square-bracket content (e.g. "[If within 2 hexes of 09.02]")
  const s = text.replace(/\[.*?\]/g, "").trim();

  // Prefer "and N <name>" pattern (e.g. "Merchant Carriage and 8 guards")
  const andMatch = s.match(/\band\s+(\d+)\s+([A-Za-z][A-Za-z ]*)/i);
  if (andMatch) {
    const count = parseInt(andMatch[1], 10);
    if (count > 0) return { count, name: cleanName(andMatch[2]) };
  }

  // Leading "N <name>" pattern
  const leadMatch = s.match(/^(\d+)\s+([A-Za-z][A-Za-z ]*)/);
  if (leadMatch) {
    const count = parseInt(leadMatch[1], 10);
    if (count > 0) return { count, name: cleanName(leadMatch[2]) };
  }

  // General fallback: find all "N <name>" occurrences where the number is
  // preceded by whitespace or punctuation (excludes things like "2-in-6").
  // Take the last match — in patterns like "Herd of deer ... by 11 hungry wolves",
  // the rolled creature count appears last.
  const allMatches = [...s.matchAll(/(?:^|[,;.\s])(\d+)\s+([A-Za-z][A-Za-z ]*)/g)];
  if (allMatches.length > 0) {
    const last = allMatches[allMatches.length - 1];
    const count = parseInt(last[1], 10);
    if (count > 0) return { count, name: cleanName(last[2]) };
  }

  return null;
}

function cleanName(raw: string): string {
  const name = raw.replace(/[.,;!?:\s]+$/, "").trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}
