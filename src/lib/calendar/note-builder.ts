/**
 * Helpers for building TipTap-compatible JSON documents written to CalendarNote.content.
 */

function text(t: string) {
  return { type: "text", text: t };
}

export function heading(level: number, t: string) {
  return { type: "heading", attrs: { level }, content: [text(t)] };
}

export function paragraph(t: string) {
  return { type: "paragraph", content: t ? [text(t)] : [] };
}

export function hr() {
  return { type: "horizontalRule" };
}

export function buildDoc(nodes: object[]): string {
  return JSON.stringify({ type: "doc", content: nodes });
}

/** Append nodes to an existing TipTap doc JSON string. */
export function appendToDoc(existing: string, nodes: object[]): string {
  try {
    const doc = JSON.parse(existing) as { type: string; content: object[] };
    doc.content.push(...nodes);
    return JSON.stringify(doc);
  } catch {
    return buildDoc(nodes);
  }
}

import type { EncounterSummary } from "@/lib/tables/encounter-roll";

interface DailyRoll {
  tableName: string;
  outcome: string;
}

interface DaySummaryParams {
  weatherRolls: DailyRoll[];
  dayEncounter: EncounterSummary | null;
  nightEncounter: EncounterSummary | null;
  isRegionReroll?: boolean;
  regionName?: string;
}

/** Build the node list for a day-summary block (weather + encounters). */
export function buildDaySummaryNodes({
  weatherRolls,
  dayEncounter,
  nightEncounter,
  isRegionReroll = false,
  regionName,
}: DaySummaryParams): object[] {
  const nodes: object[] = [];

  if (isRegionReroll) {
    nodes.push(hr(), heading(3, `Region: ${regionName ?? "Unknown"}`));
  } else {
    nodes.push(heading(2, "Day Summary"));
  }

  // Weather
  if (weatherRolls.length > 0) {
    nodes.push(heading(3, "Weather"));
    for (const w of weatherRolls) {
      nodes.push(paragraph(`${w.tableName}: ${w.outcome}`));
    }
  }

  // Encounters
  for (const enc of [dayEncounter, nightEncounter]) {
    if (!enc) continue;
    const label = enc.time ? `${enc.label} Encounter — ${enc.time}` : `${enc.label} Encounter`;
    nodes.push(heading(3, label));
    if (enc.prerequisiteRoll?.passed === false) {
      const pr = enc.prerequisiteRoll;
      nodes.push(paragraph(
        `No encounter (${pr.dice}: rolled ${pr.result}, required ${pr.min}–${pr.max})`
      ));
    } else {
      nodes.push(paragraph(enc.outcome));
      if (enc.reaction) {
        nodes.push(paragraph(`Reaction: ${enc.reaction.outcome} (${enc.reaction.tableName}, rolled ${enc.reaction.roll})`));
      }
      if (enc.surprise) {
        nodes.push(paragraph(
          enc.surprise.surprised
            ? `Surprised! (rolled ${enc.surprise.roll} on ${enc.surprise.dice}, threshold \u2264${enc.surprise.threshold})`
            : `Not surprised (rolled ${enc.surprise.roll} on ${enc.surprise.dice}, threshold \u2264${enc.surprise.threshold})`
        ));
      }
    }
  }

  return nodes;
}
