"use client";

import { useState } from "react";
import type { RandomTable } from "@/types/table";
import { TableEditModal } from "./TableEditModal";
import { useDeleteTable, useUpdateTable } from "@/hooks/useRandomTables";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { PencilIcon, Trash2Icon } from "lucide-react";

interface Props {
  title: string;
  tables: RandomTable[];
  campaignId: string;
  regions: { id: string; name: string }[];
  seasons: string[];
  onClose: () => void;
}

export function TableManagerModal({ title, tables, campaignId, regions, seasons, onClose }: Props) {
  const [editingTable, setEditingTable] = useState<RandomTable | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const deleteMutation = useDeleteTable(campaignId);
  const updateMutation = useUpdateTable(campaignId);
  const sorted = tables.slice().sort((a, b) => a.name.localeCompare(b.name));

  function setMode(table: RandomTable, mode: "BOTH" | "OVERLAND" | "DUNGEON") {
    updateMutation.mutate({ id: table.id, applicableModes: mode });
  }

  if (editingTable) {
    const current = tables.find((t) => t.id === editingTable.id) ?? editingTable;
    return (
      <TableEditModal
        table={current}
        campaignId={campaignId}
        regions={regions}
        seasons={seasons}
        onClose={() => setEditingTable(null)}
        onDeleted={() => setEditingTable(null)}
      />
    );
  }

  async function handleDelete(id: string) {
    await deleteMutation.mutateAsync(id);
    setConfirmDeleteId(null);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md flex flex-col max-h-[80vh]">
        <DialogHeader className="pb-3 border-b border-border">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto divide-y divide-border -mx-4 min-h-0">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No tables yet.</p>
          ) : (
            sorted.map((table) => {
              const mode = (table.applicableModes ?? "BOTH") as "BOTH" | "OVERLAND" | "DUNGEON";
              return (
                <div key={table.id} className="px-4 py-2.5 hover:bg-muted/40 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{table.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {table.diceExpression} · {table.rows.length} rows
                        {table.rollOnDayAdvance && <span className="ml-1.5 text-primary">· auto-roll</span>}
                      </p>
                    </div>

                    {confirmDeleteId === table.id ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs text-destructive">Delete?</span>
                        <Button
                          variant="destructive"
                          size="xs"
                          onClick={() => handleDelete(table.id)}
                          disabled={deleteMutation.isPending}
                        >
                          {deleteMutation.isPending ? "…" : "Yes"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          No
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <IconButton
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setEditingTable(table)}
                          tooltip="Edit table"
                        >
                          <PencilIcon />
                        </IconButton>
                        <IconButton
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setConfirmDeleteId(table.id)}
                          tooltip="Delete table"
                          className="hover:text-destructive"
                        >
                          <Trash2Icon />
                        </IconButton>
                      </div>
                    )}
                  </div>

                  {/* Mode pills */}
                  <div className="flex gap-1">
                    {(["BOTH", "OVERLAND", "DUNGEON"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(table, m)}
                        disabled={updateMutation.isPending}
                        className={[
                          "px-2 py-0.5 rounded-full text-[10px] border transition-colors",
                          mode === m
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
                        ].join(" ")}
                      >
                        {m === "BOTH" ? "Both" : m === "OVERLAND" ? "Overland" : "Dungeon"}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
