"use client";

import { useState } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { SavedNpcData, NpcAffiliationData } from "@/types/savedNpc";
import { useUpdateSavedNpc, useDeleteSavedNpc, useCreateAffiliation } from "@/hooks/useSavedNpcs";
import { rollExpression, isValidDiceExpression } from "@/lib/dice/roller";
import { toast } from "sonner";

interface Props {
  npc: SavedNpcData;
  affiliations: NpcAffiliationData[];
  campaignId: string;
  onClose: () => void;
  onDeleted: () => void;
}

// ─── Inline editable text field ───────────────────────────────────────────────

function EditableField({
  label,
  value,
  onSave,
  nullable = false,
}: {
  label: string;
  value: string | null;
  onSave: (v: string | null) => Promise<void>;
  nullable?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  async function commit() {
    setSaving(true);
    const next = draft.trim() || (nullable ? null : value);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      // keep editing open on error
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(value ?? "");
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold text-muted-foreground w-24 shrink-0">{label}</span>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
          className="flex-1 rounded border border-primary bg-background px-1.5 py-0.5 text-xs focus:outline-none"
          aria-label={`Edit ${label}`}
        />
        <button
          onClick={commit}
          disabled={saving}
          className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground disabled:opacity-50"
          aria-label={`Save ${label}`}
        >
          {saving ? "…" : "✓"}
        </button>
        <button
          onClick={cancel}
          className="text-[10px] px-1 py-0.5 rounded text-muted-foreground hover:text-foreground"
          aria-label={`Cancel editing ${label}`}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setDraft(value ?? ""); setEditing(true); }}
      className="w-full flex items-baseline gap-1.5 group text-left hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 transition-colors"
      aria-label={`Edit ${label}: ${value ?? "—"}`}
    >
      <span className="text-[10px] font-semibold text-muted-foreground w-24 shrink-0">{label}</span>
      <span className="text-xs text-foreground flex-1">{value ?? <em className="text-muted-foreground">—</em>}</span>
      <svg className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    </button>
  );
}

// ─── Editable list field (physical / personality) ─────────────────────────────

function EditableList({
  label,
  values,
  onSave,
}: {
  label: string;
  values: string[];
  onSave: (v: string[]) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(values);
  const [saving, setSaving] = useState(false);

  async function commit() {
    setSaving(true);
    try {
      await onSave(draft.filter((v) => v.trim() !== ""));
      setEditing(false);
    } catch {
      // keep open
    } finally {
      setSaving(false);
    }
  }

  if (!editing && values.length === 0) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold text-muted-foreground w-24 shrink-0">{label}</span>
        <button onClick={() => { setDraft([""]); setEditing(true); }} className="text-[10px] text-muted-foreground hover:text-primary transition-colors" aria-label={`Add ${label}`}>+ Add</button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="space-y-1">
        <span className="text-[10px] font-semibold text-muted-foreground">{label}</span>
        {draft.map((v, i) => (
          <div key={i} className="flex items-center gap-1.5 ml-6">
            <input
              value={v}
              onChange={(e) => {
                const next = [...draft];
                next[i] = e.target.value;
                setDraft(next);
              }}
              className="flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label={`${label} item ${i + 1}`}
            />
            <button onClick={() => setDraft(draft.filter((_, j) => j !== i))} className="text-[10px] text-muted-foreground hover:text-destructive" aria-label={`Remove ${label} item ${i + 1}`}>✕</button>
          </div>
        ))}
        <div className="flex items-center gap-2 ml-6">
          <button onClick={() => setDraft([...draft, ""])} className="text-[10px] text-muted-foreground hover:text-primary" aria-label={`Add another ${label}`}>+ Add</button>
          <button onClick={commit} disabled={saving} className="text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground disabled:opacity-50" aria-label={`Save ${label}`}>{saving ? "…" : "Save"}</button>
          <button onClick={() => { setDraft(values); setEditing(false); }} className="text-[10px] text-muted-foreground hover:text-foreground" aria-label={`Cancel editing ${label}`}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {values.map((v, i) => (
        <button
          key={i}
          onClick={() => { setDraft([...values]); setEditing(true); }}
          className="w-full flex items-baseline gap-1.5 group text-left hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 transition-colors"
          aria-label={`Edit ${label}`}
        >
          <span className="text-[10px] font-semibold text-muted-foreground w-24 shrink-0">{i === 0 ? label : ""}</span>
          <span className="text-xs text-foreground flex-1">{v}</span>
          {i === 0 && (
            <svg className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NpcDetailPanel({ npc, affiliations, campaignId, onClose, onDeleted }: Props) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [affiliationInput, setAffiliationInput] = useState(
    affiliations.find((a) => a.id === npc.affiliationId)?.name ?? ""
  );

  const updateMutation = useUpdateSavedNpc(campaignId);
  const deleteMutation = useDeleteSavedNpc(campaignId);
  const createAffMutation = useCreateAffiliation(campaignId);

  async function patch(fields: Partial<SavedNpcData>) {
    try {
      await updateMutation.mutateAsync({ id: npc.id, patch: fields });
    } catch {
      toast.error("Failed to save changes");
    }
  }

  async function handleAffiliationSave() {
    const name = affiliationInput.trim();
    if (!name) {
      await patch({ affiliationId: null });
      return;
    }
    const existing = affiliations.find((a) => a.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      await patch({ affiliationId: existing.id });
    } else {
      try {
        const created = await createAffMutation.mutateAsync(name);
        await patch({ affiliationId: created.id });
      } catch {
        toast.error("Failed to create affiliation");
      }
    }
  }

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(npc.id);
      onDeleted();
    } catch {
      toast.error("Failed to delete NPC");
    }
  }

  const currentAffName = affiliations.find((a) => a.id === npc.affiliationId)?.name;

  return (
    <div
      className="fixed inset-0 z-60 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`NPC detail: ${npc.name ?? "Unnamed NPC"}`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel — narrower slide-over, appears inside the browser */}
      <div className="relative flex flex-col w-full max-w-sm h-full bg-background border-l border-border shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between px-4 py-3 border-b border-border shrink-0 sticky top-0 bg-background z-10">
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground">Saved NPC</p>
            <h2 className="font-semibold text-sm truncate">{npc.name ?? "Unnamed NPC"}</h2>
          </div>
          <Tooltip>
            <TooltipTrigger render={
              <button
                onClick={onClose}
                className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                aria-label="Close NPC detail"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            } />
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
        </div>

        {/* Fields */}
        <div className="flex-1 px-4 py-3 space-y-2">
          <EditableField
            label="Name"
            value={npc.name}
            nullable
            onSave={(v) => patch({ name: v })}
          />
          <EditableField
            label={npc.typeLabel}
            value={npc.type}
            nullable
            onSave={(v) => patch({ type: v })}
          />
          {npc.secondaryTypeLabel && (
            <EditableField
              label={npc.secondaryTypeLabel}
              value={npc.secondaryType}
              nullable
              onSave={(v) => patch({ secondaryType: v })}
            />
          )}
          <EditableField
            label="Age"
            value={npc.age}
            nullable
            onSave={(v) => patch({ age: v })}
          />

          {/* Physical */}
          <EditableList
            label="Physical"
            values={npc.physical}
            onSave={(v) => patch({ physical: v })}
          />

          {/* Personality */}
          <EditableList
            label="Personality"
            values={npc.personality}
            onSave={(v) => patch({ personality: v })}
          />

          {/* Details */}
          {npc.details.map((d, i) => (
            <EditableField
              key={i}
              label={d.label}
              value={d.value}
              onSave={(v) =>
                patch({
                  details: npc.details.map((x, j) =>
                    j === i ? { label: x.label, value: v ?? x.value } : x
                  ),
                })
              }
            />
          ))}

          {/* Affiliation */}
          <div className="pt-2 border-t border-border/60 space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground">Affiliation</p>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                list="detail-aff-suggestions"
                value={affiliationInput}
                onChange={(e) => setAffiliationInput(e.target.value)}
                placeholder="None"
                className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                aria-label="Set affiliation"
              />
              <datalist id="detail-aff-suggestions">
                {affiliations.map((a) => (
                  <option key={a.id} value={a.name} />
                ))}
              </datalist>
              <button
                onClick={handleAffiliationSave}
                disabled={updateMutation.isPending || createAffMutation.isPending}
                className="text-[10px] px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
                aria-label="Save affiliation"
              >
                Set
              </button>
            </div>
            {currentAffName && (
              <p className="text-[10px] text-muted-foreground italic">Currently: {currentAffName}</p>
            )}
          </div>

          {/* Combatant trait */}
          <div className="pt-2 border-t border-border/60 space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={npc.isCombatant}
                onChange={(e) => patch({ isCombatant: e.target.checked })}
                className="rounded"
              />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Combatant</span>
            </label>

            {npc.isCombatant && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 pl-6">
                <CombatStatField label="AC" value={npc.combatAc != null ? String(npc.combatAc) : null} onSave={(v) => patch({ combatAc: v != null ? parseInt(v, 10) : null })} />
                <CombatStatField label="HD" value={npc.combatHd} onSave={(v) => patch({ combatHd: v })} />
                <CombatStatHpField
                  maxHp={npc.combatMaxHp}
                  hd={npc.combatHd}
                  onSave={(v) => patch({ combatMaxHp: v != null ? parseInt(v, 10) : null })}
                />
                <CombatStatField label="Atk Bonus" value={npc.combatAttackBonus != null ? String(npc.combatAttackBonus) : null} onSave={(v) => patch({ combatAttackBonus: v != null ? parseInt(v, 10) : null })} />
                <div className="col-span-2">
                  <CombatStatField label="Damage" value={npc.combatAttackDamage} onSave={(v) => patch({ combatAttackDamage: v })} />
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="pt-2 border-t border-border/60 space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground">Notes</p>
            <NotesField value={npc.notes} onSave={(v) => patch({ notes: v })} />
          </div>
        </div>

        {/* Actions footer */}
        <div className="shrink-0 px-4 py-3 border-t border-border flex items-center gap-2 sticky bottom-0 bg-background">
          {/* Pin toggle */}
          <button
            onClick={() => patch({ isPinned: !npc.isPinned })}
            className={[
              "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors",
              npc.isPinned
                ? "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20"
                : "bg-muted text-muted-foreground hover:text-foreground",
            ].join(" ")}
            aria-label={npc.isPinned ? "Unpin NPC" : "Pin NPC"}
          >
            <svg className="w-3 h-3" fill={npc.isPinned ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            {npc.isPinned ? "Pinned" : "Pin"}
          </button>

          {/* Deceased toggle */}
          <button
            onClick={() => patch({ isDeceased: !npc.isDeceased })}
            className={[
              "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors",
              npc.isDeceased
                ? "bg-red-500/10 text-red-600 hover:text-red-700"
                : "bg-muted text-muted-foreground hover:text-foreground",
            ].join(" ")}
            aria-label={npc.isDeceased ? "Mark NPC as alive" : "Mark NPC as deceased"}
          >
            {npc.isDeceased ? "Mark Alive" : "Mark Deceased"}
          </button>

          <div className="flex-1" />

          {/* Delete */}
          {showDeleteConfirm ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-destructive">Delete?</span>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="text-[10px] px-2 py-1 rounded bg-destructive text-destructive-foreground disabled:opacity-50"
                aria-label="Confirm delete NPC"
              >
                {deleteMutation.isPending ? "…" : "Yes, delete"}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="text-[10px] text-muted-foreground hover:text-foreground"
                aria-label="Cancel delete"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-[10px] px-2 py-1 rounded text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Delete NPC"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Combat stat inline fields ────────────────────────────────────────────────

function CombatStatField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string | null;
  onSave: (v: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  async function commit() {
    setSaving(true);
    try {
      await onSave(draft.trim() || null);
      setEditing(false);
    } catch {
      // keep open
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-0.5">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
            className="flex-1 rounded border border-primary bg-background px-1.5 py-0.5 text-xs focus:outline-none"
          />
          <button onClick={commit} disabled={saving} className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground disabled:opacity-50">{saving ? "…" : "✓"}</button>
          <button onClick={() => { setDraft(value ?? ""); setEditing(false); }} className="text-[10px] text-muted-foreground hover:text-foreground">✕</button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setDraft(value ?? ""); setEditing(true); }}
      className="w-full text-left group hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 transition-colors space-y-0.5"
    >
      <span className="text-[10px] text-muted-foreground block">{label}</span>
      <span className="text-xs text-foreground">{value ?? <em className="text-muted-foreground">—</em>}</span>
    </button>
  );
}

function CombatStatHpField({
  maxHp,
  hd,
  onSave,
}: {
  maxHp: number | null;
  hd: string | null;
  onSave: (v: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(maxHp != null ? String(maxHp) : "");
  const [saving, setSaving] = useState(false);

  function reroll() {
    if (!hd) return;
    try {
      if (isValidDiceExpression(hd)) {
        setDraft(String(rollExpression(hd).total));
      }
    } catch {}
  }

  async function commit() {
    setSaving(true);
    try {
      await onSave(draft.trim() || null);
      setEditing(false);
    } catch {
      // keep open
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-0.5">
        <span className="text-[10px] text-muted-foreground">Max HP</span>
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(maxHp != null ? String(maxHp) : ""); setEditing(false); } }}
            className="flex-1 rounded border border-primary bg-background px-1.5 py-0.5 text-xs focus:outline-none"
          />
          {hd && <button type="button" onClick={reroll} className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground text-xs" title="Re-roll from HD">↺</button>}
          <button onClick={commit} disabled={saving} className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground disabled:opacity-50">{saving ? "…" : "✓"}</button>
          <button onClick={() => { setDraft(maxHp != null ? String(maxHp) : ""); setEditing(false); }} className="text-[10px] text-muted-foreground hover:text-foreground">✕</button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setDraft(maxHp != null ? String(maxHp) : ""); setEditing(true); }}
      className="w-full text-left group hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 transition-colors space-y-0.5"
    >
      <span className="text-[10px] text-muted-foreground block">Max HP</span>
      <span className="text-xs text-foreground">{maxHp ?? <em className="text-muted-foreground">—</em>}</span>
    </button>
  );
}

// ─── Notes textarea ───────────────────────────────────────────────────────────

function NotesField({ value, onSave }: { value: string | null; onSave: (v: string | null) => Promise<void> }) {
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const isDirty = draft !== (value ?? "");

  async function save() {
    setSaving(true);
    try {
      await onSave(draft.trim() || null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        placeholder="Add notes…"
        className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary"
        aria-label="NPC notes"
      />
      {isDirty && (
        <button
          onClick={save}
          disabled={saving}
          className="text-[10px] px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
          aria-label="Save notes"
        >
          {saving ? "Saving…" : "Save notes"}
        </button>
      )}
    </div>
  );
}
