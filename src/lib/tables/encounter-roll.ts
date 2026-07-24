import { rollOnTable } from "./engine";
import { rollExpression } from "@/lib/dice/roller";
import { detectAndResolveSubRolls } from "./sub-roll";
import { rollEncounterTime, type EncounterWindow } from "@/lib/encounter-timing";
import type { RandomTable, ReactionResult, SurpriseResult, SubRoll, TableRollResult, PrerequisiteRoll } from "@/types/table";

export interface FullEncounterResult extends TableRollResult {
  reaction: ReactionResult | null;
  surprise: SurpriseResult | null;
  subRolls: SubRoll[];
}

/** Serialisable summary returned to the client and written into calendar notes. */
export interface EncounterSummary {
  label: string;           // "Day" | "Night" | window name
  time: string | null;     // "2:34 PM" or null
  outcome: string;         // expanded outcome text
  roll: number;
  reaction: ReactionResult | null;
  surprise: SurpriseResult | null;
  prerequisiteRoll: PrerequisiteRoll | null;
}

export function rollEncounterFull({
  table,
  reactionTable,
  regionId,
  campaignDefaultSurpriseDice,
  campaignDefaultSurpriseThreshold,
}: {
  table: RandomTable;
  reactionTable: RandomTable | null;
  regionId: string | null;
  campaignDefaultSurpriseDice?: string | null;
  campaignDefaultSurpriseThreshold?: number | null;
}): FullEncounterResult {
  const result = rollOnTable(table, regionId, []);

  // If the prerequisite check failed, skip reaction, surprise, and sub-rolls entirely.
  if (result.prerequisiteRoll?.passed === false) {
    return { ...result, reaction: null, surprise: null, subRolls: [] };
  }

  // Reaction
  let reaction: ReactionResult | null = null;
  if (reactionTable) {
    const rr = rollOnTable(reactionTable, regionId, []);
    reaction = {
      tableName: reactionTable.name,
      roll: rr.diceTotal,
      outcome: rr.resolvedOutcome.expandedText,
    };
  }

  // Surprise — table-level config takes precedence over campaign defaults
  let surprise: SurpriseResult | null = null;
  const surpriseDice = table.surpriseDice ?? campaignDefaultSurpriseDice ?? null;
  const surpriseThreshold = table.surpriseThreshold ?? campaignDefaultSurpriseThreshold ?? null;
  if (surpriseDice && surpriseThreshold !== null) {
    const sr = rollExpression(surpriseDice);
    surprise = {
      dice: surpriseDice,
      roll: sr.total,
      threshold: surpriseThreshold,
      surprised: sr.total <= surpriseThreshold,
    };
  }

  const subRolls = detectAndResolveSubRolls(result.resolvedOutcome.expandedText, table.rows);

  return { ...result, reaction, surprise, subRolls };
}

/** Map an existing roll total to an outcome on a (possibly different) table. */
export function lookupOutcomeByRoll(roll: number, table: RandomTable): string {
  const row = table.rows.find((r) => r.min <= roll && r.max >= roll);
  return row?.outcome ?? table.rows[0]?.outcome ?? "—";
}

/**
 * Roll one full encounter per configured encounter window, in order.
 *
 * Generalizes the old two hand-written "day"/"night" blocks to an arbitrary
 * number of campaign-defined windows. When no windows are configured at all
 * (a campaign that never set up `encounterWindowsJson`), falls back to the
 * legacy default of a plain "Day" + "Night" roll (no time-of-day) so
 * unconfigured campaigns keep behaving as before.
 */
export function rollEncounterForWindows(
  windows: EncounterWindow[],
  rollParams: Parameters<typeof rollEncounterFull>[0]
): EncounterSummary[] {
  if (windows.length === 0) {
    return ["Day", "Night"].map((label) => {
      const result = rollEncounterFull(rollParams);
      return {
        label,
        time: null,
        outcome: result.resolvedOutcome.expandedText,
        roll: result.diceTotal,
        reaction: result.reaction ?? null,
        surprise: result.surprise ?? null,
        prerequisiteRoll: result.prerequisiteRoll ?? null,
      };
    });
  }

  return windows.map((window) => {
    const result = rollEncounterFull(rollParams);
    return {
      label: window.name,
      time: rollEncounterTime(window),
      outcome: result.resolvedOutcome.expandedText,
      roll: result.diceTotal,
      reaction: result.reaction ?? null,
      surprise: result.surprise ?? null,
      prerequisiteRoll: result.prerequisiteRoll ?? null,
    };
  });
}
