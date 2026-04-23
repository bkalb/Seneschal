"use client";

import { useState } from "react";
import type { RandomTable, TableRollResult } from "@/types/table";
import { getVisibleModifiers } from "@/lib/tables/modifier-resolver";
import { useRollTable } from "@/hooks/useRandomTables";
import { TableRollResultDisplay } from "./TableRollResultDisplay";
import { ModifierToggleBar } from "./ModifierToggleBar";
import { TableEditModal } from "./TableEditModal";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { PencilIcon } from "lucide-react";

interface Props {
  table: RandomTable;
  campaignId: string;
  currentRegionId: string | null;
  regions: { id: string; name: string }[];
}

export function TableCard({ table, campaignId, currentRegionId, regions }: Props) {
  const [activeToggles, setActiveToggles] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<TableRollResult | null>(null);
  const [showEdit, setShowEdit] = useState(false);

  const rollMutation = useRollTable();
  const visibleModifiers = getVisibleModifiers(table, currentRegionId);

  function toggleModifier(id: string) {
    setActiveToggles((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }

  async function handleRoll() {
    try {
      const result = await rollMutation.mutateAsync({
        tableId: table.id,
        campaignId,
        currentRegionId,
        userToggles: activeToggles,
      });
      setLastResult(result);
    } catch {
      // error handled by mutation
    }
  }

  return (
    <>
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded shrink-0">
              {table.diceExpression}
            </span>
            <span className="font-medium text-sm text-foreground truncate">{table.name}</span>
            {table.isStateful && (
              <span className="text-xs text-muted-foreground shrink-0" title="Stateful: last result is remembered">
                ●
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="xs"
              onClick={handleRoll}
              disabled={rollMutation.isPending}
            >
              {rollMutation.isPending ? "Rolling…" : "Roll"}
            </Button>
            <IconButton
              variant="ghost"
              size="icon-xs"
              onClick={() => setShowEdit(true)}
              tooltip="Edit table"
            >
              <PencilIcon className="size-3.5" />
            </IconButton>
          </div>
        </div>

        {visibleModifiers.length > 0 && (
          <ModifierToggleBar
            modifiers={visibleModifiers}
            activeToggles={activeToggles}
            onToggle={toggleModifier}
          />
        )}

        {lastResult && <TableRollResultDisplay result={lastResult} tableRows={table.rows} />}
      </div>

      {showEdit && (
        <TableEditModal
          table={table}
          campaignId={campaignId}
          regions={regions}
          seasons={[]}
          onClose={() => setShowEdit(false)}
        />
      )}
    </>
  );
}
