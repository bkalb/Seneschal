import type { ParsedTablePreview } from "@/types/table";
import { parseCsv } from "./parse-csv";
import { parseMarkdown } from "./parse-markdown";
import { parsePlaintext } from "./parse-plaintext";
import { parseCommaList } from "./parse-commalist";

export type ImportFormat = "csv" | "markdown" | "plaintext" | "commalist";

export function detectFormat(raw: string): ImportFormat {
  const trimmed = raw.trim();
  const lines = trimmed.split("\n").filter(Boolean);

  // Markdown table: pipe characters on most lines
  const sampleLines = lines.slice(0, 20);
  const pipeLines = sampleLines.filter((l) => l.includes("|")).length;
  if (pipeLines > sampleLines.length * 0.4) return "markdown";

  // Comma-separated flat list: many comma-delimited items but very few numbered rows.
  // Heuristic: commas >> newlines, and most comma-tokens don't start with a number.
  const commaTokens = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  if (commaTokens.length > lines.length * 2) {
    // Make sure most tokens aren't "N text" or "N-M text" (that would be a CSV table)
    const numericStarts = commaTokens.filter((t) => /^\d/.test(t)).length;
    if (numericStarts < commaTokens.length * 0.4) return "commalist";
  }

  // CSV: consistent comma counts across multiple lines (range + outcome columns)
  const commaLines = lines.filter((l) => l.includes(",")).length;
  if (commaLines > lines.length * 0.5) return "csv";

  return "plaintext";
}

export function parseTable(raw: string, format?: ImportFormat): ParsedTablePreview {
  const fmt = format ?? detectFormat(raw);
  switch (fmt) {
    case "csv":
      return parseCsv(raw);
    case "markdown":
      return parseMarkdown(raw);
    case "commalist":
      return parseCommaList(raw);
    default:
      return parsePlaintext(raw);
  }
}
