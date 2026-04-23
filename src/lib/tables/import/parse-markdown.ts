import type { ParsedTablePreview } from "@/types/table";
import { inferDiceExpression } from "@/lib/dice/roller";

export function parseMarkdown(raw: string): ParsedTablePreview {
  const warnings: string[] = [];
  const lines = raw.split("\n").map((l) => l.trim());

  // Look for dice expression in headings like "## Roll 1d8" or "# 1d20 Encounter Table"
  let detectedDiceExpression: string | null = null;
  for (const line of lines) {
    if (line.startsWith("#")) {
      const match = line.match(/\b(\d+d\d+)\b/i);
      if (match) {
        detectedDiceExpression = match[1];
        break;
      }
    }
  }

  // Find table rows (lines with |)
  const tableLines = lines.filter((l) => l.startsWith("|") && !l.match(/^\|[-| ]+\|$/));

  if (tableLines.length === 0) {
    return {
      detectedDiceExpression: detectedDiceExpression ?? "1d6",
      rows: [],
      warnings: ["No markdown table rows found"],
    };
  }

  const tableRows: ParsedTablePreview["rows"] = [];
  let maxValue = 0;
  let isFirstRow = true;

  for (const line of tableLines) {
    const cells = line.split("|").map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cells.length < 2) continue;

    // Skip header row (first data row)
    if (isFirstRow) {
      isFirstRow = false;
      // Check if it looks like a header ("Roll", "Result", etc.)
      const firstCell = cells[0].toLowerCase();
      if (/^(roll|die|dice|d\d+|result|range|#)$/.test(firstCell)) continue;
    }

    const rangeStr = cells[0];
    const outcome = cells.slice(1).join(" | ").trim();

    const rangeMatch = rangeStr.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    const singleMatch = rangeStr.match(/^(\d+)$/);

    if (rangeMatch) {
      const min = parseInt(rangeMatch[1], 10);
      const max = parseInt(rangeMatch[2], 10);
      tableRows.push({ min, max, outcome });
      maxValue = Math.max(maxValue, max);
    } else if (singleMatch) {
      const n = parseInt(singleMatch[1], 10);
      tableRows.push({ min: n, max: n, outcome });
      maxValue = Math.max(maxValue, n);
    } else {
      warnings.push(`Could not parse range "${rangeStr}", skipping`);
    }
  }

  return {
    detectedDiceExpression: detectedDiceExpression ?? inferDiceExpression(maxValue || 6),
    rows: tableRows,
    warnings,
  };
}
