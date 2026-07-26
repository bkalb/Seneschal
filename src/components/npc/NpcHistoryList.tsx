"use client";

import { useState, type RefObject } from "react";
import type { GeneratedNpc, NpcField } from "@/types/npc";
import type { NpcResultSet, NpcHistoryRetention } from "@/types/npcHistory";
import type { RandomTable } from "@/types/table";
import { NpcResultSetView } from "./NpcResultSetView";
import { Button } from "@/components/ui/button";

interface Props {
  sets: readonly NpcResultSet[];
  retention: NpcHistoryRetention;
  /** Tables available for re-roll, threaded down from `NpcPanel` (§9.6). */
  tableMap: Map<string, RandomTable>;
  onRetentionChange: (n: NpcHistoryRetention) => void;
  onClearAll: () => void;
  onTogglePin: (setId: string) => void;
  onDismiss: (setId: string) => void;
  onSaveSingle: (setId: string, index: number, npc: GeneratedNpc) => void;
  onSaveBatch: (set: NpcResultSet) => void;
  onRerollCard: (setId: string, index: number, npc: GeneratedNpc) => void;
  onRerollField: (setId: string, index: number, npc: GeneratedNpc, field: NpcField) => void;
  isSavingSingle: boolean;
  /** Attached to the scroll container so handleGenerate can reset scrollTop (D15/§9.7). */
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

/** History header bar (§9.3), scroll container (§9.7), and the empty state. */
export function NpcHistoryList({
  sets,
  retention,
  tableMap,
  onRetentionChange,
  onClearAll,
  onTogglePin,
  onDismiss,
  onSaveSingle,
  onSaveBatch,
  onRerollCard,
  onRerollField,
  isSavingSingle,
  scrollContainerRef,
}: Props) {
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="flex flex-col gap-1.5 min-h-0">
      {/* History header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-foreground">History</span>
          <select
            value={retention}
            onChange={(e) => onRetentionChange(Number(e.target.value) as NpcHistoryRetention)}
            className="rounded border border-border bg-background px-1 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label="History retention"
            title="Sets to keep"
          >
            <option value={5}>Last 5</option>
            <option value={10}>Last 10</option>
            <option value={25}>Last 25</option>
          </select>
        </div>

        {/* Clear all — inline confirm, not a modal (matches the combat-side-delete pattern). */}
        {confirmClear ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">Sure?</span>
            <button
              onClick={() => { onClearAll(); setConfirmClear(false); }}
              className="text-[10px] text-destructive hover:opacity-80"
              title="Confirm clear"
              aria-label="Confirm clear history"
            >
              ✓
            </button>
            <button
              onClick={() => setConfirmClear(false)}
              className="text-[10px] text-muted-foreground hover:text-foreground"
              title="Cancel"
              aria-label="Cancel clear history"
            >
              ✗
            </button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setConfirmClear(true)}
            disabled={sets.length === 0}
            className="text-muted-foreground"
          >
            Clear
          </Button>
        )}
      </div>

      {/* Scroll container — all sets always expanded, newest first (D10), scrolled to top on generate. */}
      <div
        ref={scrollContainerRef}
        className="max-h-[min(60vh,40rem)] min-h-96 overflow-y-auto pr-0.5 flex flex-col gap-3"
      >
        {sets.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
            <p className="text-sm text-muted-foreground">No NPCs generated yet.</p>
          </div>
        ) : (
          sets.map((set) => (
            <NpcResultSetView
              key={set.id}
              set={set}
              tableMap={tableMap}
              onSaveSingle={(index, npc) => onSaveSingle(set.id, index, npc)}
              onSaveBatch={() => onSaveBatch(set)}
              onTogglePin={() => onTogglePin(set.id)}
              onDismiss={() => onDismiss(set.id)}
              onRerollCard={(index, npc) => onRerollCard(set.id, index, npc)}
              onRerollField={(index, npc, field) => onRerollField(set.id, index, npc, field)}
              isSavingSingle={isSavingSingle}
            />
          ))
        )}
      </div>
    </div>
  );
}
