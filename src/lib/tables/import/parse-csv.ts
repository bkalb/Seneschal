import Papa from "papaparse";
import type { ParsedTablePreview } from "@/types/table";
import { inferDiceExpression } from "@/lib/dice/roller";

export function parseCsv(raw: string): ParsedTablePreview {
  const warnings: string[] = [];
  const result = Papa.parse<string[]>(raw.trim(), { skipEmptyLines: true });
  const rows = result.data as string[][];

  if (rows.length === 0) {
    return { detectedDiceExpression: "1d6", rows: [], warnings: ["No data found"] };
  }

  // Skip header row if first cell looks like "Roll", "d20", etc.
  const firstCell = rows[0][0]?.trim().toLowerCase() ?? "";
  const hasHeader = /^(roll|die|dice|d\d+|result|range)$/i.test(firstCell);
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const tableRows: ParsedTablePreview["rows"] = [];
  let maxValue = 0;

  for (const row of dataRows) {
    if (row.length < 2) {
      warnings.push(`Skipped row with too few columns: "${row.join(",")}"`);
      continue;
    }

    const rangeStr = row[0].trim();
    const outcome = row.slice(1).join(",").trim();

    // Try "N-M" range or single number
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

  // Try to detect dice expression from header
  const headerDiceMatch = hasHeader
    ? rows[0].join(" ").match(/\b(\d*d\d+)\b/i)
    : null;
  const detectedDiceExpression = headerDiceMatch
    ? headerDiceMatch[1]
    : inferDiceExpression(maxValue || 6);

  return { detectedDiceExpression, rows: tableRows, warnings };
}
