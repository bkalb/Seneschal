"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCard } from "@/components/tables/TableCard";
import { TableImportWizard } from "@/components/tables/TableImportWizard";
import { useRandomTables } from "@/hooks/useRandomTables";
import { useSavedNpcs } from "@/hooks/useSavedNpcs";
import { rollExpression, isValidDiceExpression } from "@/lib/dice/roller";
import { singularize } from "@/lib/singularize";
import {
  useCombatEncounter,
  useStartEncounter,
  useEndEncounter,
  useAddSide,
  useAddCombatant,
  usePatchCombatant,
  useDeleteCombatant,
  useDeleteSide,
  usePatchCombatSide,
  useAdvanceRound,
  type CombatCombatantData,
  type CombatSideData,
  type CombatEncounterData,
} from "@/hooks/useCombat";

interface CampaignDefaults {
  defaultCombatAC: number | null;
  defaultCombatHD: string | null;
  defaultCombatAttackBonus: number | null;
  defaultCombatAttackDamage: string | null;
  defaultRollHpIndividually: boolean;
  defaultTraitTableId: string | null;
  defaultTraitCount: number | null;
}

interface Props {
  campaignId: string;
  campaignDefaults: CampaignDefaults;
  regions: { id: string; name: string }[];
  currentRegionId: string | null;
  prefill?: { name: string; count: number } | null;
  onPrefillConsumed?: () => void;
}

function rollHd(hd: string): number {
  try {
    if (isValidDiceExpression(hd)) {
      return rollExpression(hd).total;
    }
  } catch {}
  return 1;
}

function combatantColor(currentHp: number, maxHp: number): string {
  if (currentHp <= 0) return "text-muted-foreground line-through";
  if (currentHp < maxHp * 0.25) return "text-red-500 dark:text-red-400";
  return "";
}

// ─── Combatant row ────────────────────────────────────────────────────────────

function CombatantRow({
  combatant,
  campaignId,
}: {
  combatant: CombatCombatantData;
  campaignId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [hpInput, setHpInput] = useState(String(combatant.currentHp));
  const [editForm, setEditForm] = useState({
    name: combatant.name,
    ac: String(combatant.ac),
    hd: combatant.hd,
    maxHp: String(combatant.maxHp),
    attackBonus: String(combatant.attackBonus),
    attackDamage: combatant.attackDamage,
  });

  const patch = usePatchCombatant(campaignId);
  const del = useDeleteCombatant(campaignId);

  const nameColor = combatantColor(combatant.currentHp, combatant.maxHp);
  const tooltip = `AC ${combatant.ac}, HD ${combatant.hd}, Atk ${combatant.attackBonus >= 0 ? "+" : ""}${combatant.attackBonus}, Dmg ${combatant.attackDamage}`;

  function applyHp(newHp: number) {
    patch.mutate({ id: combatant.id, currentHp: newHp });
    setHpInput(String(newHp));
  }

  function commitHpInput() {
    const trimmed = hpInput.trim();
    let newHp: number;
    if (trimmed.startsWith("+") || trimmed.startsWith("-")) {
      const delta = parseInt(trimmed, 10);
      if (isNaN(delta)) {
        setHpInput(String(combatant.currentHp));
        return;
      }
      newHp = combatant.currentHp + delta;
    } else {
      const parsed = parseInt(trimmed, 10);
      if (isNaN(parsed)) {
        setHpInput(String(combatant.currentHp));
        return;
      }
      newHp = parsed;
    }
    patch.mutate({ id: combatant.id, currentHp: newHp });
    setHpInput(String(newHp));
  }

  function saveEdit() {
    const ac = parseInt(editForm.ac, 10);
    const maxHp = parseInt(editForm.maxHp, 10);
    const attackBonus = parseInt(editForm.attackBonus, 10);
    if (isNaN(ac) || isNaN(maxHp) || isNaN(attackBonus)) return;
    patch.mutate({
      id: combatant.id,
      name: editForm.name,
      ac,
      hd: editForm.hd,
      maxHp,
      attackBonus,
      attackDamage: editForm.attackDamage,
    });
    setEditing(false);
  }

  function rerollMaxHp() {
    const rolled = rollHd(editForm.hd);
    setEditForm((f) => ({ ...f, maxHp: String(rolled) }));
  }

  if (editing) {
    return (
      <div className="rounded border border-border bg-muted/30 p-2 space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <label className="w-10 shrink-0 text-muted-foreground">Name</label>
          <Input
            value={editForm.name}
            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            className="h-6 text-xs"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-muted-foreground">AC</label>
            <Input
              value={editForm.ac}
              onChange={(e) => setEditForm((f) => ({ ...f, ac: e.target.value }))}
              className="h-6 text-xs mt-0.5"
            />
          </div>
          <div>
            <label className="text-muted-foreground">HD</label>
            <div className="flex gap-1 mt-0.5">
              <Input
                value={editForm.hd}
                onChange={(e) => setEditForm((f) => ({ ...f, hd: e.target.value }))}
                className="h-6 text-xs"
              />
              <button
                type="button"
                onClick={rerollMaxHp}
                className="px-1.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title="Re-roll Max HP from HD"
              >
                ↺
              </button>
            </div>
          </div>
          <div>
            <label className="text-muted-foreground">Max HP</label>
            <Input
              value={editForm.maxHp}
              onChange={(e) => setEditForm((f) => ({ ...f, maxHp: e.target.value }))}
              className="h-6 text-xs mt-0.5"
            />
          </div>
          <div>
            <label className="text-muted-foreground">Atk Bonus</label>
            <Input
              value={editForm.attackBonus}
              onChange={(e) => setEditForm((f) => ({ ...f, attackBonus: e.target.value }))}
              className="h-6 text-xs mt-0.5"
            />
          </div>
          <div className="col-span-2">
            <label className="text-muted-foreground">Damage</label>
            <Input
              value={editForm.attackDamage}
              onChange={(e) => setEditForm((f) => ({ ...f, attackDamage: e.target.value }))}
              className="h-6 text-xs mt-0.5"
            />
          </div>
        </div>
        <div className="flex gap-1.5 justify-end">
          <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          <Button size="xs" onClick={saveEdit}>Save</Button>
          <Button size="xs" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => del.mutate(combatant.id)}>Delete</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-0.5 group">
      <span className={`flex-1 text-sm truncate ${nameColor}`} title={tooltip}>
        {combatant.name}
        {combatant.notes && (
          <span className="text-muted-foreground font-normal"> ({combatant.notes})</span>
        )}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <button
          className="w-5 h-5 rounded text-xs leading-none text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          onClick={() => applyHp(combatant.currentHp - 1)}
          title="Decrease HP"
        >
          −
        </button>
        <Input
          value={hpInput}
          onChange={(e) => setHpInput(e.target.value)}
          onBlur={commitHpInput}
          onKeyDown={(e) => { if (e.key === "Enter") commitHpInput(); }}
          className={`w-12 h-6 text-xs text-center p-0 ${nameColor}`}
          title={`${combatant.currentHp} / ${combatant.maxHp} HP`}
        />
        <button
          className="w-5 h-5 rounded text-xs leading-none text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          onClick={() => applyHp(combatant.currentHp + 1)}
          title="Increase HP"
        >
          +
        </button>
      </div>
      <button
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
        onClick={() => setEditing(true)}
        title="Edit combatant"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    </div>
  );
}

// ─── Side card ────────────────────────────────────────────────────────────────

function SideCard({
  side,
  campaignId,
  campaignDefaults,
}: {
  side: CombatSideData;
  campaignId: string;
  campaignDefaults: CampaignDefaults;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showNpcPicker, setShowNpcPicker] = useState(false);
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const patchSide = usePatchCombatSide(campaignId);
  const [addForm, setAddForm] = useState({
    name: "",
    count: "1",
    ac: String(campaignDefaults.defaultCombatAC ?? 9),
    hd: campaignDefaults.defaultCombatHD ?? "1d8",
    maxHp: "",
    rollIndividually: campaignDefaults.defaultRollHpIndividually,
    attackBonus: String(campaignDefaults.defaultCombatAttackBonus ?? 0),
    attackDamage: campaignDefaults.defaultCombatAttackDamage ?? "1d6",
  });

  const addCombatant = useAddCombatant(campaignId);
  const deleteSide = useDeleteSide(campaignId);
  const { data: combatantNpcs = [] } = useSavedNpcs(campaignId, {});

  const eligibleNpcs = combatantNpcs.filter((n) => n.isCombatant);
  const count = Math.max(1, parseInt(addForm.count, 10) || 1);

  function rollHpFromHd() {
    const rolled = rollHd(addForm.hd);
    setAddForm((f) => ({ ...f, maxHp: String(rolled) }));
  }

  function submitAdd() {
    const ac = parseInt(addForm.ac, 10);
    const attackBonus = parseInt(addForm.attackBonus, 10);
    if (!addForm.name || isNaN(ac) || isNaN(attackBonus)) return;
    if (!addForm.rollIndividually && !addForm.maxHp) return;

    if (addForm.rollIndividually) {
      const maxHps = Array.from({ length: count }, () => rollHd(addForm.hd));
      addCombatant.mutate({
        sideId: side.id,
        name: addForm.name,
        count,
        ac,
        hd: addForm.hd,
        maxHps,
        attackBonus,
        attackDamage: addForm.attackDamage,
      });
    } else {
      const maxHp = parseInt(addForm.maxHp, 10);
      if (isNaN(maxHp)) return;
      addCombatant.mutate({
        sideId: side.id,
        name: addForm.name,
        count,
        ac,
        hd: addForm.hd,
        maxHp,
        attackBonus,
        attackDamage: addForm.attackDamage,
      });
    }
    setShowAddForm(false);
    setAddForm((f) => ({ ...f, name: "", count: "1", maxHp: "" }));
  }

  function addFromNpc(npcId: string) {
    const npc = eligibleNpcs.find((n) => n.id === npcId);
    if (!npc) return;
    addCombatant.mutate({
      sideId: side.id,
      name: npc.name ?? npc.type ?? "NPC",
      ac: npc.combatAc ?? parseInt(String(campaignDefaults.defaultCombatAC ?? 9), 10),
      hd: npc.combatHd ?? (campaignDefaults.defaultCombatHD ?? "1d8"),
      maxHp: npc.combatMaxHp ?? rollHd(npc.combatHd ?? (campaignDefaults.defaultCombatHD ?? "1d8")),
      attackBonus: npc.combatAttackBonus ?? (campaignDefaults.defaultCombatAttackBonus ?? 0),
      attackDamage: npc.combatAttackDamage ?? (campaignDefaults.defaultCombatAttackDamage ?? "1d6"),
    });
    setShowNpcPicker(false);
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        {renamingName !== null ? (
          <Input
            value={renamingName}
            onChange={(e) => setRenamingName(e.target.value)}
            onBlur={() => {
              const trimmed = renamingName.trim();
              if (trimmed && trimmed !== side.name) patchSide.mutate({ id: side.id, name: trimmed });
              setRenamingName(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRenamingName(null);
            }}
            className="h-6 text-sm font-semibold p-1"
            autoFocus
          />
        ) : (
          <button
            className="text-sm font-semibold hover:text-muted-foreground transition-colors text-left"
            onClick={() => setRenamingName(side.name)}
            title="Click to rename"
          >
            {side.name}
          </button>
        )}
        <button
          onClick={() => { if (window.confirm(`Remove "${side.name}" and all its combatants?`)) deleteSide.mutate(side.id); }}
          className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
          title="Remove side"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-0.5">
        {side.combatants.map((c) => (
          <CombatantRow key={c.id} combatant={c} campaignId={campaignId} />
        ))}
        {side.combatants.length === 0 && (
          <p className="text-xs text-muted-foreground">No combatants yet.</p>
        )}
      </div>

      {showAddForm ? (
        <div className="rounded border border-border bg-muted/30 p-2 space-y-2 text-xs">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label className="text-muted-foreground">Name</label>
              <Input
                placeholder="Orc Captain"
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                className="h-6 text-xs mt-0.5"
                autoFocus
              />
            </div>
            <div>
              <label className="text-muted-foreground">Count</label>
              <Input
                type="number"
                min={1}
                max={100}
                value={addForm.count}
                onChange={(e) => setAddForm((f) => ({ ...f, count: e.target.value }))}
                className="h-6 text-xs mt-0.5 w-14"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-muted-foreground">AC</label>
              <Input value={addForm.ac} onChange={(e) => setAddForm((f) => ({ ...f, ac: e.target.value }))} className="h-6 text-xs mt-0.5" />
            </div>
            <div>
              <label className="text-muted-foreground">HD</label>
              <div className="flex gap-1 mt-0.5">
                <Input value={addForm.hd} onChange={(e) => setAddForm((f) => ({ ...f, hd: e.target.value }))} className="h-6 text-xs" />
                {!addForm.rollIndividually && (
                  <button type="button" onClick={rollHpFromHd} className="px-1.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors shrink-0" title="Roll Max HP from HD">↺</button>
                )}
              </div>
            </div>
            <div>
              <label className={addForm.rollIndividually ? "text-muted-foreground/40" : "text-muted-foreground"}>Max HP</label>
              <Input
                value={addForm.rollIndividually ? "" : addForm.maxHp}
                onChange={(e) => setAddForm((f) => ({ ...f, maxHp: e.target.value }))}
                disabled={addForm.rollIndividually}
                placeholder={addForm.rollIndividually ? "rolled" : ""}
                className="h-6 text-xs mt-0.5"
              />
            </div>
            <div>
              <label className="text-muted-foreground">Atk Bonus</label>
              <Input value={addForm.attackBonus} onChange={(e) => setAddForm((f) => ({ ...f, attackBonus: e.target.value }))} className="h-6 text-xs mt-0.5" />
            </div>
            <div className="col-span-2">
              <label className="text-muted-foreground">Damage</label>
              <Input value={addForm.attackDamage} onChange={(e) => setAddForm((f) => ({ ...f, attackDamage: e.target.value }))} className="h-6 text-xs mt-0.5" />
            </div>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={addForm.rollIndividually}
              onChange={(e) => setAddForm((f) => ({ ...f, rollIndividually: e.target.checked }))}
              className="rounded"
            />
            <span className="text-muted-foreground">Roll HP individually from HD</span>
          </label>
          <div className="flex gap-1.5 justify-end">
            <Button size="xs" variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
            <Button
              size="xs"
              onClick={submitAdd}
              disabled={!addForm.name || (!addForm.rollIndividually && !addForm.maxHp)}
            >
              Add {count > 1 ? `${count}` : ""}
            </Button>
          </div>
        </div>
      ) : showNpcPicker ? (
        <div className="rounded border border-border bg-muted/30 p-2 space-y-1 text-xs">
          {eligibleNpcs.length === 0 ? (
            <p className="text-muted-foreground">No saved NPCs with Combatant trait.</p>
          ) : (
            <div className="space-y-0.5 max-h-40 overflow-y-auto">
              {eligibleNpcs.map((npc) => (
                <button
                  key={npc.id}
                  onClick={() => addFromNpc(npc.id)}
                  className="w-full text-left px-2 py-1 rounded hover:bg-muted transition-colors"
                >
                  <span className="font-medium">{npc.name ?? npc.type ?? "NPC"}</span>
                  {npc.combatAc != null && (
                    <span className="ml-2 text-muted-foreground">AC {npc.combatAc}, HD {npc.combatHd}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          <Button size="xs" variant="ghost" onClick={() => setShowNpcPicker(false)}>Cancel</Button>
        </div>
      ) : (
        <div className="flex gap-1.5">
          <Button size="xs" variant="ghost" onClick={() => setShowAddForm(true)}>+ Add Combatant</Button>
          {eligibleNpcs.length > 0 && (
            <Button size="xs" variant="ghost" onClick={() => setShowNpcPicker(true)}>+ From NPC</Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Add Side form ────────────────────────────────────────────────────────────

function AddSideForm({
  encounterId,
  campaignId,
  campaignDefaults,
  onClose,
  initialName,
  initialCount,
}: {
  encounterId: string;
  campaignId: string;
  campaignDefaults: CampaignDefaults;
  onClose: () => void;
  initialName?: string;
  initialCount?: number;
}) {
  const [form, setForm] = useState({
    name: initialName ?? "",
    count: String(initialCount ?? 1),
    ac: String(campaignDefaults.defaultCombatAC ?? 9),
    hd: campaignDefaults.defaultCombatHD ?? "1d8",
    maxHp: "",
    rollIndividually: campaignDefaults.defaultRollHpIndividually,
    attackBonus: String(campaignDefaults.defaultCombatAttackBonus ?? 0),
    attackDamage: campaignDefaults.defaultCombatAttackDamage ?? "1d6",
    useTraits: false,
    traitTableId: campaignDefaults.defaultTraitTableId ?? "",
    traitCount: campaignDefaults.defaultTraitCount?.toString() ?? "2",
  });
  const [showTraitImport, setShowTraitImport] = useState(false);

  const addSide = useAddSide(campaignId);
  const { data: npcTables = [] } = useRandomTables(campaignId, "NPC");
  const sortedNpcTables = npcTables.slice().sort((a, b) => a.name.localeCompare(b.name));

  // Auto-select first NPC table when list loads, but only if no default is configured
  useEffect(() => {
    if (sortedNpcTables.length > 0 && !form.traitTableId && !campaignDefaults.defaultTraitTableId) {
      setForm((f) => ({ ...f, traitTableId: sortedNpcTables[0].id }));
    }
  }, [sortedNpcTables.length]);

  const count = Math.max(1, parseInt(form.count, 10) || 1);
  const singularName = singularize(form.name || "Combatant");
  const previewNames = count === 1
    ? [form.name || "Combatant"]
    : Array.from({ length: Math.min(count, 6) }, (_, i) => `${singularName} ${i + 1}`);

  function rollHpFromHd() {
    const rolled = rollHd(form.hd);
    setForm((f) => ({ ...f, maxHp: String(rolled) }));
  }

  function submit() {
    const ac = parseInt(form.ac, 10);
    const attackBonus = parseInt(form.attackBonus, 10);
    if (!form.name || isNaN(ac) || isNaN(attackBonus)) return;
    if (!form.rollIndividually && !form.maxHp) return;

    const traitTableId = form.useTraits && form.traitTableId ? form.traitTableId : undefined;
    const traitCount = form.useTraits && form.traitTableId
      ? Math.max(1, parseInt(form.traitCount, 10) || 2)
      : undefined;

    if (form.rollIndividually) {
      const maxHps = Array.from({ length: count }, () => rollHd(form.hd));
      addSide.mutate({ encounterId, name: form.name, count, ac, hd: form.hd, maxHps, attackBonus, attackDamage: form.attackDamage, traitTableId, traitCount });
    } else {
      const maxHp = parseInt(form.maxHp, 10);
      if (isNaN(maxHp)) return;
      addSide.mutate({ encounterId, name: form.name, count, ac, hd: form.hd, maxHp, attackBonus, attackDamage: form.attackDamage, traitTableId, traitCount });
    }
    onClose();
  }

  return (
    <>
      <div className="rounded-lg border border-border bg-card p-3 space-y-3 text-xs">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Add Side</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className="text-muted-foreground">Side / Combatant Name</label>
            <Input
              placeholder="e.g. Orc"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="h-7 text-xs mt-0.5"
              autoFocus
            />
          </div>
          <div>
            <label className="text-muted-foreground">Count</label>
            <Input
              type="number"
              min={1}
              max={100}
              value={form.count}
              onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))}
              className="h-7 text-xs mt-0.5"
            />
          </div>
          <div>
            <label className="text-muted-foreground">AC</label>
            <Input value={form.ac} onChange={(e) => setForm((f) => ({ ...f, ac: e.target.value }))} className="h-7 text-xs mt-0.5" />
          </div>
          <div>
            <label className="text-muted-foreground">HD</label>
            <div className="flex gap-1 mt-0.5">
              <Input value={form.hd} onChange={(e) => setForm((f) => ({ ...f, hd: e.target.value }))} className="h-7 text-xs" />
              {!form.rollIndividually && (
                <button type="button" onClick={rollHpFromHd} className="px-1.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors shrink-0" title="Roll Max HP">↺</button>
              )}
            </div>
          </div>
          <div>
            <label className={form.rollIndividually ? "text-muted-foreground/40" : "text-muted-foreground"}>Max HP</label>
            <Input
              value={form.rollIndividually ? "" : form.maxHp}
              onChange={(e) => setForm((f) => ({ ...f, maxHp: e.target.value }))}
              disabled={form.rollIndividually}
              placeholder={form.rollIndividually ? "rolled" : ""}
              className="h-7 text-xs mt-0.5"
            />
          </div>
          <div>
            <label className="text-muted-foreground">Atk Bonus</label>
            <Input value={form.attackBonus} onChange={(e) => setForm((f) => ({ ...f, attackBonus: e.target.value }))} className="h-7 text-xs mt-0.5" />
          </div>
          <div>
            <label className="text-muted-foreground">Damage</label>
            <Input value={form.attackDamage} onChange={(e) => setForm((f) => ({ ...f, attackDamage: e.target.value }))} className="h-7 text-xs mt-0.5" />
          </div>
        </div>

        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.rollIndividually}
            onChange={(e) => setForm((f) => ({ ...f, rollIndividually: e.target.checked }))}
            className="rounded"
          />
          <span className="text-muted-foreground">Roll HP individually from HD</span>
        </label>

        {/* Humanoid traits */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.useTraits}
              onChange={(e) => setForm((f) => ({ ...f, useTraits: e.target.checked }))}
              className="rounded"
            />
            <span className="text-muted-foreground">Humanoid traits</span>
          </label>

          {form.useTraits && (
            <div className="pl-5 flex items-center gap-1.5">
              {sortedNpcTables.length > 0 ? (
                <>
                  <select
                    value={form.traitTableId}
                    onChange={(e) => setForm((f) => ({ ...f, traitTableId: e.target.value }))}
                    className="flex-1 min-w-0 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {sortedNpcTables.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={form.traitCount}
                    onChange={(e) => setForm((f) => ({ ...f, traitCount: e.target.value }))}
                    className="w-12 h-7 text-xs text-center"
                    title="Number of traits per combatant"
                  />
                  <span className="text-muted-foreground shrink-0">each</span>
                </>
              ) : (
                <span className="text-muted-foreground italic">No NPC tables yet.</span>
              )}
              <button
                type="button"
                onClick={() => setShowTraitImport(true)}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                title="Import NPC trait table"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {form.name && (
          <div className="rounded bg-muted/50 p-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Preview: </span>
            {previewNames.join(", ")}
            {count > 6 && ` … (${count} total)`}
          </div>
        )}

        <div className="flex gap-1.5 justify-end">
          <Button size="xs" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="xs" onClick={submit} disabled={!form.name || (!form.rollIndividually && !form.maxHp) || addSide.isPending}>
            {addSide.isPending ? "Adding…" : `Add ${count === 1 ? "1 Combatant" : `${count} Combatants`}`}
          </Button>
        </div>
      </div>

      {showTraitImport && (
        <TableImportWizard
          campaignId={campaignId}
          category="NPC"
          regions={[]}
          seasons={[]}
          onClose={() => setShowTraitImport(false)}
        />
      )}
    </>
  );
}

// ─── Reactions & Morale section ───────────────────────────────────────────────

// ─── Round Tracker ────────────────────────────────────────────────────────────

function RoundTracker({
  encounter,
  campaignId,
}: {
  encounter: CombatEncounterData;
  campaignId: string;
}) {
  const { sides } = encounter;

  // Derive initial phase from persisted state: if any side has already acted,
  // we're in the "act" phase; otherwise prompt to set initiative order.
  const [phase, setPhase] = useState<"roll" | "act">(() =>
    sides.some((s) => s.actedThisRound) ? "act" : "roll"
  );

  // Local draft order for the roll phase (array of side IDs in desired order).
  const [draftOrder, setDraftOrder] = useState<string[]>(() =>
    [...sides].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.id)
  );

  const patchSide = usePatchCombatSide(campaignId);
  const advanceRound = useAdvanceRound(campaignId);

  // Keep draftOrder in sync when sides list changes (e.g. a new side is added).
  useEffect(() => {
    setDraftOrder((prev) => {
      const prevIds = new Set(prev);
      const newIds = sides.map((s) => s.id);
      // Add new sides at the end, remove deleted ones.
      const filtered = prev.filter((id) => newIds.includes(id));
      const added = newIds.filter((id) => !prevIds.has(id));
      return [...filtered, ...added];
    });
  }, [sides.map((s) => s.id).join(",")]);

  if (sides.length === 0) return null;

  // Ordered sides for display during act phase.
  const orderedSides = [...sides].sort((a, b) => a.sortOrder - b.sortOrder);
  const allActed = orderedSides.every((s) => s.actedThisRound);

  function moveSide(index: number, direction: -1 | 1) {
    const next = [...draftOrder];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setDraftOrder(next);
  }

  async function beginRound() {
    // Persist sortOrder only for sides whose position changed.
    const updates = draftOrder
      .map((id, idx) => ({ id, newOrder: idx }))
      .filter(({ id, newOrder }) => {
        const side = sides.find((s) => s.id === id);
        return side && side.sortOrder !== newOrder;
      });
    await Promise.all(updates.map(({ id, newOrder }) => patchSide.mutateAsync({ id, sortOrder: newOrder })));
    setPhase("act");
  }

  async function handleNextRound() {
    await advanceRound.mutateAsync(encounter.id);
    setPhase("roll");
    setDraftOrder([...sides].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.id));
  }

  if (phase === "roll") {
    const draftSides = draftOrder.map((id) => sides.find((s) => s.id === id)!).filter(Boolean);
    return (
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Round {encounter.currentRound} — Set Initiative Order
        </p>
        <div className="space-y-1">
          {draftSides.map((side, idx) => (
            <div key={side.id} className="flex items-center gap-1.5">
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveSide(idx, -1)}
                  disabled={idx === 0}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-20 leading-none"
                  aria-label="Move up"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveSide(idx, 1)}
                  disabled={idx === draftSides.length - 1}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-20 leading-none"
                  aria-label="Move down"
                >
                  ▼
                </button>
              </div>
              <span className="text-sm">{side.name}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button size="xs" onClick={beginRound} disabled={patchSide.isPending}>
            Begin Round {encounter.currentRound}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Round {encounter.currentRound}
      </p>
      <div className="space-y-1">
        {orderedSides.map((side, idx) => (
          <div key={side.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={side.actedThisRound}
              onChange={(e) => patchSide.mutate({ id: side.id, actedThisRound: e.target.checked })}
              className="rounded"
            />
            <span className={["text-sm", side.actedThisRound ? "text-muted-foreground line-through" : ""].join(" ")}>
              {side.name}
            </span>
            {idx === 0 && !side.actedThisRound && (
              <span className="text-xs text-amber-500 dark:text-amber-400 font-medium">Goes First</span>
            )}
            {side.actedThisRound && (
              <span className="text-xs text-muted-foreground">Done</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button
          size="xs"
          onClick={handleNextRound}
          disabled={!allActed || advanceRound.isPending}
        >
          Next Round
        </Button>
      </div>
    </div>
  );
}

function ReactionsAndMoraleSection({
  campaignId,
  regions,
  currentRegionId,
}: {
  campaignId: string;
  regions: { id: string; name: string }[];
  currentRegionId: string | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const { data: reactionTables = [] } = useRandomTables(campaignId, "REACTION");
  const { data: moraleTables = [] } = useRandomTables(campaignId, "MORALE");

  if (reactionTables.length === 0 && moraleTables.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors w-full text-left"
      >
        <svg
          className={["w-3 h-3 transition-transform text-indigo-400", collapsed ? "-rotate-90" : ""].join(" ")}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        Reactions &amp; Morale
      </button>

      {!collapsed && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reaction</p>
            {reactionTables.map((t) => (
              <TableCard key={t.id} table={t} campaignId={campaignId} currentRegionId={currentRegionId} regions={regions} />
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Morale</p>
            {moraleTables.map((t) => (
              <TableCard key={t.id} table={t} campaignId={campaignId} currentRegionId={currentRegionId} regions={regions} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CombatPanel ──────────────────────────────────────────────────────────────

export function CombatPanel({ campaignId, campaignDefaults, regions, currentRegionId, prefill, onPrefillConsumed }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [showAddSide, setShowAddSide] = useState(false);
  const [addSidePrefill, setAddSidePrefill] = useState<{ name: string; count: number } | null>(null);
  const pendingPrefillRef = useRef<{ name: string; count: number } | null>(null);
  const startedForPrefillRef = useRef(false);
  const initialLoadCheckedRef = useRef(false);

  const { data: encounter, isLoading } = useCombatEncounter(campaignId);
  const startEncounter = useStartEncounter(campaignId);
  const endEncounter = useEndEncounter(campaignId);

  // On initial load, open Add Side form if an encounter exists with no sides yet.
  useEffect(() => {
    if (isLoading || initialLoadCheckedRef.current) return;
    initialLoadCheckedRef.current = true;
    if (encounter && encounter.sides.every((s) => s.isPlayerSide)) {
      setShowAddSide(true);
    }
  }, [isLoading, encounter]);

  // When a new prefill arrives from the parent, store it for processing.
  useEffect(() => {
    if (!prefill) return;
    pendingPrefillRef.current = prefill;
    startedForPrefillRef.current = false;
  }, [prefill]);

  // Once the encounter is available (or confirmed absent), process the pending prefill.
  useEffect(() => {
    const pending = pendingPrefillRef.current;
    if (!pending || isLoading) return;
    if (encounter) {
      pendingPrefillRef.current = null;
      startedForPrefillRef.current = false;
      setAddSidePrefill(pending);
      setShowAddSide(true);
      onPrefillConsumed?.();
    } else if (!startedForPrefillRef.current) {
      startedForPrefillRef.current = true;
      startEncounter.mutate(undefined);
    }
  }, [prefill, encounter, isLoading]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Loading combat…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors px-1"
      >
        <svg
          className={["w-3 h-3 transition-transform text-red-400 dark:text-red-500", collapsed ? "-rotate-90" : ""].join(" ")}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        Combat
      </button>

      {!collapsed && (
        <>
          {!encounter ? (
            <div className="rounded-lg border border-border bg-card p-4 flex flex-col items-center gap-2">
              <p className="text-sm text-muted-foreground">No active encounter.</p>
              <Button
                size="sm"
                onClick={() => startEncounter.mutate(undefined, { onSuccess: () => setShowAddSide(true) })}
                disabled={startEncounter.isPending}
              >
                {startEncounter.isPending ? "Starting…" : "Start New Encounter"}
              </Button>
            </div>
          ) : (
            <>
              {/* Encounter header */}
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-sm font-medium">{encounter.name ?? "Encounter"}</span>
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => endEncounter.mutate(encounter.id)}
                >
                  End Encounter
                </Button>
              </div>

              {/* Round tracker */}
              <RoundTracker encounter={encounter} campaignId={campaignId} />

              {/* Sides — player side is tracked in the round tracker only */}
              {encounter.sides.filter((s) => !s.isPlayerSide).map((side) => (
                <SideCard
                  key={side.id}
                  side={side}
                  campaignId={campaignId}
                  campaignDefaults={campaignDefaults}
                />
              ))}

              {/* Add Side form or button */}
              {showAddSide ? (
                <AddSideForm
                  encounterId={encounter.id}
                  campaignId={campaignId}
                  campaignDefaults={campaignDefaults}
                  initialName={addSidePrefill?.name}
                  initialCount={addSidePrefill?.count}
                  onClose={() => { setShowAddSide(false); setAddSidePrefill(null); }}
                />
              ) : (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setShowAddSide(true)}
                  className="self-start"
                >
                  + Add Side
                </Button>
              )}
            </>
          )}

          {/* Reactions & Morale */}
          <ReactionsAndMoraleSection
            campaignId={campaignId}
            regions={regions}
            currentRegionId={currentRegionId}
          />
        </>
      )}
    </div>
  );
}
