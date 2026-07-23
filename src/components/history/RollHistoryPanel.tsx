"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { X, Trash2, Copy, Dices } from "lucide-react";
import { useRollHistoryStore } from "@/stores/rollHistoryStore";
import { useRollTable } from "@/hooks/useRandomTables";
import { TableRollResultDisplay } from "@/components/tables/TableRollResultDisplay";
import { Button } from "@/components/ui/button";
import type { TableRollResult } from "@/types/table";

interface Props {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  currentRegionId: string | null;
}

function summarize(entry: TableRollResult): string {
  const outcome = entry.resolvedOutcome?.expandedText ?? entry.matchedRow?.outcome ?? "";
  return `${entry.tableName}: ${outcome} (rolled ${entry.diceTotal})`;
}

export function RollHistoryPanel({ open, onClose, campaignId, currentRegionId }: Props) {
  const entries = useRollHistoryStore((s) => s.entries);
  const clearHistory = useRollHistoryStore((s) => s.clearHistory);
  const rollTable = useRollTable();

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function handleCopy(entry: TableRollResult) {
    navigator.clipboard
      .writeText(summarize(entry))
      .then(() => toast.success("Copied"))
      .catch(() => toast.error("Failed to copy"));
  }

  function handleReroll(entry: TableRollResult) {
    rollTable.mutate(
      { tableId: entry.tableId, campaignId, currentRegionId, userToggles: [] },
      {
        onError: () => toast.error("Re-roll failed"),
      }
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-y-0 right-0 z-50 w-96 max-w-full bg-background border-l shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-semibold text-sm">Roll History</h2>
          <div className="flex items-center gap-1">
            <Button
              size="xs"
              variant="ghost"
              onClick={clearHistory}
              title="Clear history"
              aria-label="Clear history"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={onClose}
              title="Close"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3 space-y-4">
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rolls yet.</p>
          ) : (
            entries.map((entry, i) => (
              <div key={`${entry.timestamp}-${i}`} className="border-b border-border pb-3 last:border-b-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{entry.tableName}</span>
                    {" "}
                    <span>{new Date(entry.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => handleCopy(entry)}
                      title="Copy summary"
                      aria-label="Copy summary"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => handleReroll(entry)}
                      disabled={rollTable.isPending}
                      title="Re-roll this table"
                      aria-label="Re-roll this table"
                    >
                      <Dices className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <TableRollResultDisplay result={entry} />
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
