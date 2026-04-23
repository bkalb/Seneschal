"use client";

import { useState } from "react";
import type { NpcProfileConfig } from "@/types/npc";
import type { RandomTable } from "@/types/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { XIcon, PlusIcon } from "lucide-react";

interface Props {
  profileName: string;
  config: NpcProfileConfig;
  tables: RandomTable[];
  onSave: (config: NpcProfileConfig, name: string) => void;
  onClose: () => void;
  onDelete: () => void;
  isSaving: boolean;
  isDeleting: boolean;
}

const NONE = "";

function TableSelect({
  value,
  tables,
  onChange,
  placeholder = "None",
}: {
  value: string | null;
  tables: RandomTable[];
  onChange: (id: string | null) => void;
  placeholder?: string;
}) {
  return (
    <select
      value={value ?? NONE}
      onChange={(e) => onChange(e.target.value || null)}
      className="flex-1 min-w-0 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
    >
      <option value={NONE}>{placeholder}</option>
      {tables.map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  );
}

export function NpcProfileEditor({ profileName: initialName, config: initialConfig, tables, onSave, onClose, onDelete, isSaving, isDeleting }: Props) {
  const [name, setName] = useState(initialName);
  const [config, setConfig] = useState<NpcProfileConfig>({ ...initialConfig });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const sorted = tables.slice().sort((a, b) => a.name.localeCompare(b.name));

  function patch(partial: Partial<NpcProfileConfig>) {
    setConfig((prev) => ({ ...prev, ...partial }));
  }

  function addPhysical() {
    patch({ physicalTableIds: [...config.physicalTableIds, sorted[0]?.id ?? ""] });
  }
  function updatePhysical(i: number, id: string) {
    const next = [...config.physicalTableIds];
    next[i] = id;
    patch({ physicalTableIds: next });
  }
  function removePhysical(i: number) {
    patch({ physicalTableIds: config.physicalTableIds.filter((_, j) => j !== i) });
  }

  function addPersonality() {
    patch({ personalityTableIds: [...config.personalityTableIds, sorted[0]?.id ?? ""] });
  }
  function updatePersonality(i: number, id: string) {
    const next = [...config.personalityTableIds];
    next[i] = id;
    patch({ personalityTableIds: next });
  }
  function removePersonality(i: number) {
    patch({ personalityTableIds: config.personalityTableIds.filter((_, j) => j !== i) });
  }

  function addDetail() {
    patch({ detailTableIds: [...config.detailTableIds, { label: "", tableId: sorted[0]?.id ?? "" }] });
  }
  function updateDetail(i: number, field: "label" | "tableId", value: string) {
    const next = config.detailTableIds.map((d, j) => j === i ? { ...d, [field]: value } : d);
    patch({ detailTableIds: next });
  }
  function removeDetail(i: number) {
    patch({ detailTableIds: config.detailTableIds.filter((_, j) => j !== i) });
  }

  const canSave =
    name.trim().length > 0 &&
    config.typeLabel.trim().length > 0 &&
    config.detailTableIds.every((d) => d.label.trim().length > 0 && d.tableId.length > 0);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg flex flex-col max-h-[90vh]">
        <DialogHeader className="pb-3 border-b border-border">
          <DialogTitle>Configure NPC Profile</DialogTitle>
        </DialogHeader>

        <div className="py-2 border-b border-border shrink-0">
          <label className="text-xs font-medium text-muted-foreground block mb-1">Profile name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Townsfolk, Merchant"
            className="w-full rounded border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-5 py-2 min-h-0">
          {tables.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Import some NPC tables first.
            </p>
          )}

          {/* ── Type ── */}
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Primary type</p>
            <p className="text-xs text-muted-foreground leading-snug">
              The main distinguishing category for this NPC — e.g. Homeland, Ancestry, Species.
              Name is resolved automatically from this result + gender using tagged name tables.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder='Label, e.g. "Homeland"'
                value={config.typeLabel}
                onChange={(e) => patch({ typeLabel: e.target.value })}
                className="w-36 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary shrink-0"
              />
              <TableSelect value={config.typeTableId} tables={sorted} onChange={(id) => patch({ typeTableId: id })} placeholder="No table (skip)" />
            </div>
          </section>

          {/* ── Secondary type ── */}
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Secondary type <span className="normal-case font-normal text-muted-foreground">(optional)</span></p>
            <p className="text-xs text-muted-foreground leading-snug">
              An optional second type — e.g. Class, Role. Leave the label blank to hide this field.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder='Label, e.g. "Class"'
                value={config.secondaryTypeLabel ?? ""}
                onChange={(e) => patch({ secondaryTypeLabel: e.target.value || null })}
                className="w-36 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary shrink-0"
              />
              <TableSelect value={config.secondaryTypeTableId} tables={sorted} onChange={(id) => patch({ secondaryTypeTableId: id })} placeholder="No table (skip)" />
            </div>
          </section>

          {/* ── Age ── */}
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Age <span className="normal-case font-normal text-muted-foreground">(optional)</span></p>
            <p className="text-xs text-muted-foreground leading-snug">
              Table to roll for age. The outcome text is used directly (e.g. "32").
            </p>
            <TableSelect value={config.ageTableId} tables={sorted} onChange={(id) => patch({ ageTableId: id })} placeholder="No table (skip)" />
          </section>

          {/* ── Physical traits ── */}
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Physical traits <span className="normal-case font-normal text-muted-foreground">(optional)</span></p>
            {config.physicalTableIds.map((id, i) => (
              <div key={i} className="flex items-center gap-2">
                <TableSelect value={id} tables={sorted} onChange={(v) => updatePhysical(i, v ?? "")} />
                <IconButton variant="ghost" size="icon-xs" onClick={() => removePhysical(i)} className="shrink-0 hover:text-destructive" tooltip="Remove table">
                  <XIcon />
                </IconButton>
              </div>
            ))}
            <Button variant="ghost" size="xs" onClick={addPhysical} className="text-muted-foreground">
              <PlusIcon />
              Add physical trait table
            </Button>
          </section>

          {/* ── Personality traits ── */}
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Personality traits <span className="normal-case font-normal text-muted-foreground">(optional)</span></p>
            {config.personalityTableIds.map((id, i) => (
              <div key={i} className="flex items-center gap-2">
                <TableSelect value={id} tables={sorted} onChange={(v) => updatePersonality(i, v ?? "")} />
                <IconButton variant="ghost" size="icon-xs" onClick={() => removePersonality(i)} className="shrink-0 hover:text-destructive" tooltip="Remove table">
                  <XIcon />
                </IconButton>
              </div>
            ))}
            <Button variant="ghost" size="xs" onClick={addPersonality} className="text-muted-foreground">
              <PlusIcon />
              Add personality trait table
            </Button>
          </section>

          {/* ── Detail tables ── */}
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Other details <span className="normal-case font-normal text-muted-foreground">(optional)</span></p>
            <p className="text-xs text-muted-foreground leading-snug">
              Any additional labelled rolls — e.g. Occupation, Motivation, Distinguishing mark.
            </p>
            {config.detailTableIds.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Label"
                  value={d.label}
                  onChange={(e) => updateDetail(i, "label", e.target.value)}
                  className="w-28 shrink-0 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <TableSelect value={d.tableId} tables={sorted} onChange={(v) => updateDetail(i, "tableId", v ?? "")} />
                <IconButton variant="ghost" size="icon-xs" onClick={() => removeDetail(i)} className="shrink-0 hover:text-destructive" tooltip="Remove table">
                  <XIcon />
                </IconButton>
              </div>
            ))}
            <Button variant="ghost" size="xs" onClick={addDetail} className="text-muted-foreground">
              <PlusIcon />
              Add detail table
            </Button>
          </section>
        </div>

        <DialogFooter className="sm:justify-between">
          <div>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-destructive">Delete this profile?</span>
                <Button variant="destructive" size="xs" onClick={onDelete} disabled={isDeleting}>
                  {isDeleting ? "Deleting…" : "Delete"}
                </Button>
                <Button variant="ghost" size="xs" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                className="text-muted-foreground hover:text-destructive"
              >
                Delete profile
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </DialogClose>
            <Button
              size="sm"
              onClick={() => onSave(config, name.trim())}
              disabled={!canSave || isSaving}
            >
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
