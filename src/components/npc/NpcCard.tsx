"use client";

import type { GeneratedNpc, NpcField, NpcRecipe } from "@/types/npc";
import type { RandomTable } from "@/types/table";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";
import { RefreshCwIcon } from "lucide-react";

const NO_RECIPE_TOOLTIP = "No recipe saved — can't re-roll (generated before this feature)";
const MISSING_TABLE_TOOLTIP = "Source table no longer exists — can't re-roll";

/** The recipe table id a given field was rolled from, or null if the field was never configured. */
function fieldTableId(recipe: NpcRecipe, field: NpcField): string | null {
  switch (field.kind) {
    case "name": return recipe.nameTableId;
    case "type": return recipe.typeTableId;
    case "secondaryType": return recipe.secondaryTypeTableId;
    case "age": return recipe.ageTableId;
    case "physical": return recipe.physicalTableIds[field.index] ?? null;
    case "personality": return recipe.personalityTableIds[field.index] ?? null;
    case "detail": return recipe.detailTables[field.index]?.tableId ?? null;
  }
}

/**
 * Whether a field's ↻ should be disabled, and why. A missing recipe (hydrated
 * pre-feature data) and a missing source table (deleted, or recategorized out
 * of NPC — indistinguishable from `tableMap`, see §9.6) get distinct wording.
 */
function fieldRerollState(
  npc: GeneratedNpc,
  field: NpcField,
  tableMap: Map<string, RandomTable>
): { disabled: boolean; tooltip: string } {
  if (!npc.recipe) return { disabled: true, tooltip: NO_RECIPE_TOOLTIP };
  const tableId = fieldTableId(npc.recipe, field);
  const disabled = tableId == null || !tableMap.has(tableId);
  return { disabled, tooltip: disabled ? MISSING_TABLE_TOOLTIP : "" };
}

interface Props {
  npc: GeneratedNpc;
  showIndex: boolean;
  index: number;
  /** Tables available for re-roll, keyed by id. Passed down rather than fetched here — leaf cards don't call hooks. */
  tableMap: Map<string, RandomTable>;
  onSave?: () => void;
  isSaving?: boolean;
  /** Whole-card re-roll (§9.6). Disabled by the caller-independent `npc.recipe` check below. */
  onRerollCard: () => void;
  /** Per-field re-roll (§9.6). */
  onRerollField: (field: NpcField) => void;
}

/** A single value line with a hover-revealed re-roll affordance (§9.6). */
function RerollableRow({
  label,
  value,
  field,
  npc,
  tableMap,
  onRerollField,
}: {
  label: string;
  value: string;
  field: NpcField;
  npc: GeneratedNpc;
  tableMap: Map<string, RandomTable>;
  onRerollField: (field: NpcField) => void;
}) {
  const { disabled, tooltip } = fieldRerollState(npc, field, tableMap);
  return (
    <div className="group flex items-center gap-1">
      <div className="min-w-0 flex-1">
        <span className="text-[10px] font-semibold text-muted-foreground">{label}: </span>
        <span className="text-xs text-foreground">{value}</span>
      </div>
      <IconButton
        variant="ghost"
        size="icon-xs"
        onClick={() => onRerollField(field)}
        disabled={disabled}
        tooltip={disabled ? tooltip : `Re-roll ${label}`}
        aria-label={`Re-roll ${label}`}
        className="size-4 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <RefreshCwIcon className="size-2.5" />
      </IconButton>
    </div>
  );
}

/**
 * One generated NPC's card. `isSaved` is derived from `npc.savedNpcId` rather
 * than threaded in as a prop: markSaved() (npcHistoryStore) writes it on
 * save, and re-roll clears it back to null (D8), so the badge always reflects
 * the NPC's own current state instead of separately-tracked UI state.
 */
export function NpcCard({ npc, showIndex, index, tableMap, onSave, isSaving, onRerollCard, onRerollField }: Props) {
  const isMale = npc.gender === "male";
  const isSaved = npc.savedNpcId != null;
  const hasRecipe = npc.recipe != null;
  const nameRerollState = fieldRerollState(npc, { kind: "name" }, tableMap);

  return (
    <div className="rounded-lg border border-border bg-card p-2.5 space-y-1">
      {/* Header: name (or index fallback) + gender + save + whole-card re-roll */}
      <div className="flex items-baseline justify-between gap-1 pb-0.5 border-b border-border/60">
        <div className="group flex items-baseline gap-1 min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground leading-tight truncate">
            {npc.name ?? (showIndex ? `#${index + 1}` : "—")}
          </p>
          {npc.name !== null && (
            <IconButton
              variant="ghost"
              size="icon-xs"
              onClick={() => onRerollField({ kind: "name" })}
              disabled={nameRerollState.disabled}
              tooltip={nameRerollState.disabled ? nameRerollState.tooltip : "Re-roll name"}
              aria-label="Re-roll name"
              className="size-4 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            >
              <RefreshCwIcon className="size-2.5" />
            </IconButton>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onSave && (
            <Button
              variant="ghost"
              size="xs"
              onClick={onSave}
              disabled={isSaved || isSaving}
              title={isSaved ? "Saved" : "Save this NPC"}
              aria-label={isSaved ? "NPC saved" : "Save NPC"}
              className={cn(isSaved ? "text-green-600 dark:text-green-500 disabled:opacity-100" : "")}
            >
              {isSaved ? "✓ Saved" : "Save"}
            </Button>
          )}
          <IconButton
            variant="ghost"
            size="icon-xs"
            onClick={onRerollCard}
            disabled={!hasRecipe}
            tooltip={hasRecipe ? "Re-roll this NPC" : NO_RECIPE_TOOLTIP}
            aria-label="Re-roll NPC"
          >
            <RefreshCwIcon />
          </IconButton>
          {/* Gender is display-only — it only changes as a consequence of a whole-card re-roll (D4/§9.6). */}
          <span className={cn("text-sm font-bold", isMale ? "text-blue-600 dark:text-blue-400" : "text-pink-600 dark:text-pink-400")}>
            {isMale ? "♂" : "♀"}
          </span>
        </div>
      </div>

      {/* Type */}
      {npc.type !== null && (
        <RerollableRow
          label={npc.typeLabel}
          value={npc.type}
          field={{ kind: "type" }}
          npc={npc}
          tableMap={tableMap}
          onRerollField={onRerollField}
        />
      )}

      {/* Secondary type */}
      {npc.secondaryType !== null && npc.secondaryTypeLabel && (
        <RerollableRow
          label={npc.secondaryTypeLabel}
          value={npc.secondaryType}
          field={{ kind: "secondaryType" }}
          npc={npc}
          tableMap={tableMap}
          onRerollField={onRerollField}
        />
      )}

      {/* Age */}
      {npc.age !== null && (
        <RerollableRow
          label="Age"
          value={npc.age}
          field={{ kind: "age" }}
          npc={npc}
          tableMap={tableMap}
          onRerollField={onRerollField}
        />
      )}

      {/* Physical traits */}
      {npc.physical.map((trait, i) => (
        <RerollableRow
          key={`phys-${i}`}
          label="Physical"
          value={trait}
          field={{ kind: "physical", index: i }}
          npc={npc}
          tableMap={tableMap}
          onRerollField={onRerollField}
        />
      ))}

      {/* Personality traits */}
      {npc.personality.map((trait, i) => (
        <RerollableRow
          key={`pers-${i}`}
          label="Personality"
          value={trait}
          field={{ kind: "personality", index: i }}
          npc={npc}
          tableMap={tableMap}
          onRerollField={onRerollField}
        />
      ))}

      {/* Detail rolls */}
      {npc.details.map((d, i) => (
        <RerollableRow
          key={`det-${i}`}
          label={d.label}
          value={d.value}
          field={{ kind: "detail", index: i }}
          npc={npc}
          tableMap={tableMap}
          onRerollField={onRerollField}
        />
      ))}
    </div>
  );
}
