import type { RandomTable, TableRollResult, PrerequisiteRoll } from "@/types/table";
import { rollExpression } from "@/lib/dice/roller";
import { scanAndRollInlineNotation } from "@/lib/dice/outcome-expander";
import { resolveModifiers } from "./modifier-resolver";

export function rollOnTable(
  table: RandomTable,
  currentRegionId: string | null,
  userToggles: string[]
): TableRollResult {
  // ── Prerequisite die check ────────────────────────────────────────────────────
  // If configured, roll the prerequisite die first. Only proceed to the main table
  // roll if the result falls within [prerequisiteMin, prerequisiteMax] (inclusive).
  let prerequisiteRoll: PrerequisiteRoll | null = null;
  if (
    table.prerequisiteDice &&
    table.prerequisiteMin !== null &&
    table.prerequisiteMax !== null
  ) {
    const prereqResult = rollExpression(table.prerequisiteDice);
    const passed =
      prereqResult.total >= table.prerequisiteMin &&
      prereqResult.total <= table.prerequisiteMax;
    prerequisiteRoll = {
      dice: table.prerequisiteDice,
      result: prereqResult.total,
      min: table.prerequisiteMin,
      max: table.prerequisiteMax,
      passed,
    };
    if (!passed) {
      return {
        tableId: table.id,
        tableName: table.name,
        rawDiceTotal: 0,
        diceTotal: 0,
        appliedModifiers: [],
        matchedRow: { id: "", tableId: table.id, min: 0, max: 0, outcome: "No encounter" },
        resolvedOutcome: { rawText: "No encounter", expandedText: "No encounter", inlineRolls: [] },
        timestamp: Date.now(),
        prerequisiteRoll,
      };
    }
  }

  const baseRoll = rollExpression(table.diceExpression);
  const rawDiceTotal = baseRoll.total;

  const appliedModifiers = resolveModifiers(table, currentRegionId, userToggles);
  let totalAdjustment = appliedModifiers.reduce((sum, m) => sum + m.adjustment, 0);

  // Apply persistent manual modifier (GM-set, stored on the table)
  if (table.manualModifier !== 0) {
    appliedModifiers.push({
      label: `Manual (${table.manualModifier > 0 ? "+" : ""}${table.manualModifier})`,
      adjustment: table.manualModifier,
      source: "user_toggle",
    });
    totalAdjustment += table.manualModifier;
  }

  const diceTotal = rawDiceTotal + totalAdjustment;

  // Find matching row; clamp to nearest if out of range
  const sorted = [...table.rows].sort((a, b) => a.min - b.min);
  const matchedRow =
    sorted.find((r) => diceTotal >= r.min && diceTotal <= r.max) ??
    (diceTotal < sorted[0].min ? sorted[0] : sorted[sorted.length - 1]);

  const resolvedOutcome = scanAndRollInlineNotation(matchedRow.outcome);

  return {
    tableId: table.id,
    tableName: table.name,
    rawDiceTotal,
    diceTotal,
    appliedModifiers,
    matchedRow,
    resolvedOutcome,
    timestamp: Date.now(),
    ...(prerequisiteRoll !== null && { prerequisiteRoll }),
  };
}
