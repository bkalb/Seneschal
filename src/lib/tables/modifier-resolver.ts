import type { RandomTable, TableModifier, AppliedModifier, ModifierExtraConfig } from "@/types/table";

function evalPrevResultCondition(
  extraConfig: ModifierExtraConfig,
  lastModifiedResult: number | null
): boolean {
  if (extraConfig.type !== "prev_result_condition") return false;
  if (lastModifiedResult === null) return false;
  const { operator, threshold } = extraConfig;
  if (operator === "lte") return lastModifiedResult <= threshold;
  if (operator === "gte") return lastModifiedResult >= threshold;
  if (operator === "eq") return lastModifiedResult === threshold;
  return false;
}

export function resolveModifiers(
  table: RandomTable,
  currentRegionId: string | null,
  userToggles: string[] // IDs of modifiers the user has toggled on
): AppliedModifier[] {
  const applied: AppliedModifier[] = [];

  for (const mod of table.modifiers) {
    if (mod.behavior === "AUTO_REGION") {
      if (currentRegionId && mod.autoRegionIds.includes(currentRegionId)) {
        applied.push({ label: mod.label, adjustment: mod.rollAdjustment, source: "auto" });
      }
    } else if (mod.behavior === "CONDITIONAL_REGION") {
      if (currentRegionId && mod.conditionalRegionIds.includes(currentRegionId)) {
        if (userToggles.includes(mod.id)) {
          applied.push({ label: mod.label, adjustment: mod.rollAdjustment, source: "user_toggle" });
        }
      }
    } else if (mod.behavior === "PREV_RESULT_CONDITION") {
      const cfg = mod.extraConfig;
      if (cfg && evalPrevResultCondition(cfg, table.lastModifiedResult ?? null)) {
        applied.push({ label: mod.label, adjustment: mod.rollAdjustment, source: "auto" });
      }
    } else {
      // ALWAYS
      if (userToggles.includes(mod.id)) {
        applied.push({ label: mod.label, adjustment: mod.rollAdjustment, source: "user_toggle" });
      }
    }
  }

  return applied;
}

// Returns which modifiers should be shown as toggles to the user given the current region
export function getVisibleModifiers(
  table: RandomTable,
  currentRegionId: string | null
): TableModifier[] {
  return table.modifiers.filter((mod) => {
    if (mod.behavior === "AUTO_REGION") return false; // never shown
    if (mod.behavior === "PREV_RESULT_CONDITION") return false; // fires automatically
    if (mod.behavior === "CONDITIONAL_REGION") {
      return currentRegionId != null && mod.conditionalRegionIds.includes(currentRegionId);
    }
    return true; // ALWAYS
  });
}
