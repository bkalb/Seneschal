"use client";

import { useState } from "react";
import type { GeneratedNpc } from "@/types/npc";
import type { NpcAffiliationData } from "@/types/savedNpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  npcs: GeneratedNpc[];
  affiliations: NpcAffiliationData[];
  isSaving: boolean;
  onSave: (selectedNpcs: GeneratedNpc[], affiliationName: string | undefined) => void;
  onClose: () => void;
}

export function SaveBatchDialog({ npcs, affiliations, isSaving, onSave, onClose }: Props) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(npcs.map((_, i) => i)));
  const [affiliationInput, setAffiliationInput] = useState("");

  function toggle(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === npcs.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(npcs.map((_, i) => i)));
    }
  }

  function handleSave() {
    const selectedNpcs = npcs.filter((_, i) => selected.has(i));
    if (selectedNpcs.length === 0) return;
    onSave(selectedNpcs, affiliationInput.trim() || undefined);
  }

  const selectedCount = selected.size;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm flex flex-col max-h-[80vh]" aria-label="Save batch of NPCs">
        <DialogHeader className="pb-3 border-b border-border">
          <DialogTitle>Save as Group</DialogTitle>
        </DialogHeader>

        {/* Affiliation input */}
        <div className="py-2 border-b border-border space-y-1.5">
          <Label htmlFor="affiliation-input" className="text-xs text-muted-foreground">
            Affiliation (optional)
          </Label>
          <Input
            id="affiliation-input"
            type="text"
            list={affiliations.length > 0 ? "affiliation-suggestions" : undefined}
            value={affiliationInput}
            onChange={(e) => setAffiliationInput(e.target.value)}
            placeholder="e.g. Bogrim's Bandits"
            aria-label="Affiliation name"
          />
          {affiliations.length > 0 && (
            <datalist id="affiliation-suggestions">
              {affiliations.map((a) => (
                <option key={a.id} value={a.name} />
              ))}
            </datalist>
          )}
        </div>

        {/* NPC checklist */}
        <div className="flex-1 overflow-y-auto -mx-4 min-h-0">
          {/* Select all toggle */}
          <div className="px-4 py-2 border-b border-border/60 flex items-center gap-2">
            <input
              type="checkbox"
              id="select-all"
              checked={selected.size === npcs.length}
              onChange={toggleAll}
              className="rounded"
              aria-label="Select all NPCs"
            />
            <label htmlFor="select-all" className="text-xs text-muted-foreground cursor-pointer select-none">
              Select all ({npcs.length})
            </label>
          </div>

          <ul className="divide-y divide-border/60">
            {npcs.map((npc, idx) => {
              const label = npc.name ?? `NPC #${idx + 1}`;
              const sub = [npc.type, npc.secondaryType].filter(Boolean).join(" · ");
              return (
                <li key={idx} className="flex items-start gap-3 px-4 py-2.5">
                  <input
                    type="checkbox"
                    id={`npc-${idx}`}
                    checked={selected.has(idx)}
                    onChange={() => toggle(idx)}
                    className="mt-0.5 rounded"
                    aria-label={`Include ${label}`}
                  />
                  <label htmlFor={`npc-${idx}`} className="cursor-pointer select-none min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{label}</p>
                    {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <DialogFooter showCloseButton>
          <Button
            onClick={handleSave}
            disabled={selectedCount === 0 || isSaving}
            aria-label={`Save ${selectedCount} of ${npcs.length} NPCs`}
          >
            {isSaving ? "Saving…" : `Save ${selectedCount} of ${npcs.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
