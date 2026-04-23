import type { ParsedTablePreview } from "@/types/table";

export function parseCommaList(raw: string): ParsedTablePreview {
  const warnings: string[] = [];

  // Split on commas, collapse surrounding whitespace (including newlines from line-wrapped lists)
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (items.length === 0) {
    return { detectedDiceExpression: "1d6", rows: [], warnings: ["No items found in list."] };
  }

  const rows = items.map((outcome, i) => ({ min: i + 1, max: i + 1, outcome }));

  // Use exact list length — non-standard die sizes are fine (roller supports any 1dN)
  const diceExpression = `1d${items.length}`;

  return { detectedDiceExpression: diceExpression, rows, warnings };
}
