"use client";

import { useState, useEffect } from "react";
import type { RandomTable, TableModifier, ModifierBehavior, ModifierExtraConfig, RollWhenNoSeason } from "@/types/table";
import { isValidDiceExpression } from "@/lib/dice/roller";
import { useUpdateTable, useDeleteTable } from "@/hooks/useRandomTables";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { XIcon, PlusIcon, ChevronUpIcon, ChevronDownIcon } from "lucide-react";

// ── Modifier presets (localStorage, per campaign) ─────────────────────────────

interface ModifierPreset {
  id: string;
  name: string;
  modifiers: Omit<EditableModifier, "_key">[];
}

function presetKey(campaignId: string) {
  return `modifier-presets-${campaignId}`;
}

function loadPresets(campaignId: string): ModifierPreset[] {
  try {
    const raw = localStorage.getItem(presetKey(campaignId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePresets(campaignId: string, presets: ModifierPreset[]) {
  localStorage.setItem(presetKey(campaignId), JSON.stringify(presets));
}

function parseSeasonNames(seasonName: string | null): string[] {
  if (!seasonName) return [];
  return seasonName.split(",").map((s) => s.trim()).filter(Boolean);
}

interface EditableRow {
  _key: string;
  min: number | "";
  max: number | "";
  outcome: string;
}

interface EditableModifier {
  _key: string;
  label: string;
  behavior: ModifierBehavior;
  rollAdjustment: number;
  extraConfig: ModifierExtraConfig | null;
  autoRegionIds: string[];
  conditionalRegionIds: string[];
}

interface Props {
  table: RandomTable;
  campaignId: string;
  regions: { id: string; name: string }[];
  seasons: string[];
  onClose: () => void;
  onDeleted?: () => void;
}

function toEditableRows(rows: RandomTable["rows"]): EditableRow[] {
  return rows.map((r) => ({ _key: r.id, min: r.min, max: r.max, outcome: r.outcome }));
}

function toEditableModifiers(modifiers: RandomTable["modifiers"]): EditableModifier[] {
  return modifiers.map((m) => ({
    _key: m.id,
    label: m.label,
    behavior: m.behavior,
    rollAdjustment: m.rollAdjustment,
    extraConfig: m.extraConfig ?? null,
    autoRegionIds: m.autoRegionIds,
    conditionalRegionIds: m.conditionalRegionIds,
  }));
}

export function TableEditModal({ table, campaignId, regions, seasons, onClose, onDeleted }: Props) {
  const [name, setName] = useState(table.name);
  const [diceExpression, setDiceExpression] = useState(table.diceExpression);
  const [isStateful, setIsStateful] = useState(table.isStateful);
  const [rollOnDayAdvance, setRollOnDayAdvance] = useState(table.rollOnDayAdvance);
  const [selectedSeasons, setSelectedSeasons] = useState<string[]>(parseSeasonNames(table.seasonName));
  const [rollWhenNoSeason, setRollWhenNoSeason] = useState<RollWhenNoSeason>(table.rollWhenNoSeason);
  const [surpriseDice, setSurpriseDice] = useState(table.surpriseDice ?? "");
  const [surpriseThreshold, setSurpriseThreshold] = useState<number | "">(table.surpriseThreshold ?? "");
  const [selectedRegionIds, setSelectedRegionIds] = useState<string[]>(table.regionIds);
  const [rows, setRows] = useState<EditableRow[]>(toEditableRows(table.rows));
  const [modifiers, setModifiers] = useState<EditableModifier[]>(toEditableModifiers(table.modifiers));
  const [npcForType, setNpcForType] = useState(table.npcForType ?? "");
  const [npcForGender, setNpcForGender] = useState<"" | "male" | "female">(
    (table.npcForGender as "" | "male" | "female") ?? ""
  );
  const [applicableModes, setApplicableModes] = useState<"BOTH" | "OVERLAND" | "DUNGEON">(
    (table.applicableModes as "BOTH" | "OVERLAND" | "DUNGEON") ?? "BOTH"
  );
  const [prerequisiteDice, setPrerequisiteDice] = useState(table.prerequisiteDice ?? "");
  const [prerequisiteMin, setPrerequisiteMin] = useState<number | "">(table.prerequisiteMin ?? "");
  const [prerequisiteMax, setPrerequisiteMax] = useState<number | "">(table.prerequisiteMax ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState<"rows" | "modifiers">("rows");

  useEffect(() => {
    setName(table.name);
    setDiceExpression(table.diceExpression);
    setIsStateful(table.isStateful);
    setRollOnDayAdvance(table.rollOnDayAdvance);
    setSelectedSeasons(parseSeasonNames(table.seasonName));
    setRollWhenNoSeason(table.rollWhenNoSeason);
    setSurpriseDice(table.surpriseDice ?? "");
    setSurpriseThreshold(table.surpriseThreshold ?? "");
    setSelectedRegionIds(table.regionIds);
    setRows(toEditableRows(table.rows));
    setModifiers(toEditableModifiers(table.modifiers));
    setNpcForType(table.npcForType ?? "");
    setNpcForGender((table.npcForGender as "" | "male" | "female") ?? "");
    setApplicableModes((table.applicableModes as "BOTH" | "OVERLAND" | "DUNGEON") ?? "BOTH");
    setPrerequisiteDice(table.prerequisiteDice ?? "");
    setPrerequisiteMin(table.prerequisiteMin ?? "");
    setPrerequisiteMax(table.prerequisiteMax ?? "");
    setConfirmDelete(false);
  }, [table.id]);

  const updateMutation = useUpdateTable(campaignId);
  const deleteMutation = useDeleteTable(campaignId);

  function toggleRegion(id: string) {
    setSelectedRegionIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  }

  function toggleSeason(name: string) {
    setSelectedSeasons((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]
    );
  }

  // ── Row handlers ──────────────────────────────────────────────────────────

  function updateRow(key: string, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r) => r._key === key ? { ...r, ...patch } : r));
  }
  function addRow() {
    const lastMax = rows.length > 0
      ? (typeof rows[rows.length - 1].max === "number" ? (rows[rows.length - 1].max as number) : 0)
      : 0;
    setRows((prev) => [...prev, { _key: crypto.randomUUID(), min: lastMax + 1, max: lastMax + 1, outcome: "" }]);
  }
  function removeRow(key: string) { setRows((prev) => prev.filter((r) => r._key !== key)); }
  function moveRow(idx: number, dir: -1 | 1) {
    setRows((prev) => {
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  // ── Modifier handlers ─────────────────────────────────────────────────────

  function addModifier() {
    setModifiers((prev) => [...prev, {
      _key: crypto.randomUUID(),
      label: "",
      behavior: "ALWAYS",
      rollAdjustment: 0,
      extraConfig: null,
      autoRegionIds: [],
      conditionalRegionIds: [],
    }]);
  }
  function removeModifier(key: string) { setModifiers((prev) => prev.filter((m) => m._key !== key)); }
  function updateModifier(key: string, patch: Partial<EditableModifier>) {
    setModifiers((prev) => prev.map((m) => m._key === key ? { ...m, ...patch } : m));
  }
  function setBehavior(key: string, behavior: ModifierBehavior) {
    // Reset extraConfig when switching behavior
    let extraConfig: ModifierExtraConfig | null = null;
    if (behavior === "PREV_RESULT_CONDITION") {
      extraConfig = { type: "prev_result_condition", operator: "lte", threshold: 2 };
    }
    updateModifier(key, { behavior, extraConfig, autoRegionIds: [], conditionalRegionIds: [] });
  }

  // ── Modifier presets ──────────────────────────────────────────────────────

  const [presets, setPresets] = useState<ModifierPreset[]>(() => loadPresets(campaignId));
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [savePresetName, setSavePresetName] = useState("");

  function handleSavePreset() {
    const name = savePresetName.trim();
    if (!name || modifiers.length === 0) return;
    const preset: ModifierPreset = {
      id: crypto.randomUUID(),
      name,
      modifiers: modifiers.map(({ _key: _k, ...rest }) => rest),
    };
    const next = [...presets, preset];
    savePresets(campaignId, next);
    setPresets(next);
    setSavePresetName("");
    setShowSavePreset(false);
  }

  function handleDeletePreset(id: string) {
    const next = presets.filter((p) => p.id !== id);
    savePresets(campaignId, next);
    setPresets(next);
  }

  // ── Save / delete ─────────────────────────────────────────────────────────

  const validRows = rows.filter((r) => r.min !== "" && r.max !== "" && r.outcome.trim());
  const rowsValid = validRows.length > 0 && validRows.length === rows.length;
  const canSave = name.trim() && isValidDiceExpression(diceExpression) && rowsValid && !updateMutation.isPending;

  async function handleSave() {
    if (!canSave) return;
    await updateMutation.mutateAsync({
      id: table.id,
      name: name.trim(),
      diceExpression,
      isStateful,
      rollOnDayAdvance,
      seasonName: selectedSeasons.length > 0 ? selectedSeasons.join(",") : null,
      rollWhenNoSeason,
      surpriseDice: surpriseDice.trim() || null,
      surpriseThreshold: surpriseThreshold !== "" ? surpriseThreshold : null,
      prerequisiteDice: prerequisiteDice.trim() || null,
      prerequisiteMin: prerequisiteMin !== "" ? prerequisiteMin : null,
      prerequisiteMax: prerequisiteMax !== "" ? prerequisiteMax : null,
      npcForType: npcForType.trim() || null,
      npcForGender: npcForGender || null,
      applicableModes,
      regionIds: selectedRegionIds,
      rows: rows.map(({ min, max, outcome }) => ({
        min: min as number,
        max: max as number,
        outcome: outcome.trim(),
      })) as any,
      modifiers: modifiers.map(({ _key: _k, extraConfig, ...mod }) => ({
        ...mod,
        extraConfig: extraConfig ? JSON.stringify(extraConfig) : null,
      })) as any,
    });
    onClose();
  }

  async function handleDelete() {
    await deleteMutation.mutateAsync(table.id);
    onDeleted?.();
    onClose();
  }

  const isCalendar = table.category === "CALENDAR";
  const isEncounter = table.category === "ENCOUNTER";
  const isNpc = table.category === "NPC";

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
        <DialogHeader className="pb-3 border-b border-border">
          <DialogTitle>Edit Table</DialogTitle>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto py-2 space-y-4 min-h-0">

          {/* Name + dice */}
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1">
              <Label htmlFor="table-name" className="text-xs text-muted-foreground">Table name</Label>
              <Input id="table-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="table-dice" className="text-xs text-muted-foreground">Dice</Label>
              <Input id="table-dice" type="text" value={diceExpression} onChange={(e) => setDiceExpression(e.target.value)}
                className="w-24 font-mono" />
              {diceExpression && !isValidDiceExpression(diceExpression) && (
                <p className="text-xs text-destructive">e.g. "1d20"</p>
              )}
            </div>
          </div>

          {/* Flags */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={isStateful} onChange={(e) => setIsStateful(e.target.checked)} className="rounded" />
              Stateful
            </label>
            {isCalendar && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={rollOnDayAdvance} onChange={(e) => setRollOnDayAdvance(e.target.checked)} className="rounded" />
                Auto-roll on day advance
              </label>
            )}
          </div>

          {/* Mode filter */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Exploration mode</label>
            <div className="flex gap-2">
              {(["BOTH", "OVERLAND", "DUNGEON"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setApplicableModes(m)}
                  className={[
                    "px-2.5 py-1 rounded-full text-xs border transition-colors",
                    applicableModes === m
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary",
                  ].join(" ")}
                >
                  {m === "BOTH" ? "Both" : m === "OVERLAND" ? "Overland" : "Dungeon"}
                </button>
              ))}
            </div>
          </div>

          {/* Season filter — CALENDAR only */}
          {isCalendar && rollOnDayAdvance && seasons.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Seasons
                <span className="ml-1.5 font-normal text-muted-foreground/70">— blank = roll in all seasons</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {seasons.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSeason(s)}
                    className={[
                      "px-2.5 py-1 rounded-full text-xs border transition-colors",
                      selectedSeasons.includes(s)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary",
                    ].join(" ")}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Surprise roll — ENCOUNTER tables only */}
          {isEncounter && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Surprise roll
                <span className="ml-1.5 font-normal text-muted-foreground/70">— leave blank to skip</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={surpriseDice}
                  onChange={(e) => setSurpriseDice(e.target.value)}
                  placeholder="e.g. 1d6"
                  className="w-24 rounded border border-border bg-background px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-xs text-muted-foreground">surprised if roll ≤</span>
                <input
                  type="number"
                  value={surpriseThreshold}
                  onChange={(e) => setSurpriseThreshold(e.target.value === "" ? "" : parseInt(e.target.value))}
                  placeholder="2"
                  min={1}
                  className="w-16 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          )}

          {/* Prerequisite check */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Prerequisite check
              <span className="ml-1.5 font-normal text-muted-foreground/70">— leave blank to always roll</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={prerequisiteDice}
                onChange={(e) => setPrerequisiteDice(e.target.value)}
                placeholder="e.g. 1d6"
                className="w-24 rounded border border-border bg-background px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-xs text-muted-foreground">roll only if result is</span>
              <input
                type="number"
                value={prerequisiteMin}
                onChange={(e) => setPrerequisiteMin(e.target.value === "" ? "" : parseInt(e.target.value))}
                placeholder="min"
                min={1}
                className="w-16 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <input
                type="number"
                value={prerequisiteMax}
                onChange={(e) => setPrerequisiteMax(e.target.value === "" ? "" : parseInt(e.target.value))}
                placeholder="max"
                min={1}
                className="w-16 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* NPC name-table tags — NPC tables only */}
          {isNpc && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Name table tags
                <span className="ml-1.5 font-normal text-muted-foreground/70">— only set these if this table is a name table</span>
              </label>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">For type</label>
                  <input
                    type="text"
                    value={npcForType}
                    onChange={(e) => setNpcForType(e.target.value)}
                    placeholder="e.g. Ruislip, Talford"
                    className="w-32 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">Gender</label>
                  <select
                    value={npcForGender}
                    onChange={(e) => setNpcForGender(e.target.value as "" | "male" | "female")}
                    className="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Any</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Regions */}
          {regions.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Regions
                {isCalendar && (
                  <span className="ml-1.5 font-normal text-muted-foreground/70">
                    — leave blank to roll in all regions
                  </span>
                )}
              </label>
              <div className="flex flex-wrap gap-2">
                {regions.map((r) => (
                  <button key={r.id} onClick={() => toggleRegion(r.id)}
                    className={["px-2.5 py-1 rounded-full text-xs border transition-colors",
                      selectedRegionIds.includes(r.id)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary"].join(" ")}
                  >{r.name}</button>
                ))}
              </div>
            </div>
          )}

          {/* Tabs: Rows / Modifiers */}
          <div className="flex gap-1 border-b border-border pb-0">
            {(["rows", "modifiers"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={["px-3 py-1.5 text-xs capitalize border-b-2 -mb-px transition-colors",
                  tab === t ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
                ].join(" ")}
              >{t} {t === "modifiers" && modifiers.length > 0 ? `(${modifiers.length})` : ""}</button>
            ))}
          </div>

          {/* Rows tab */}
          {tab === "rows" && (
            <div>
              <div className="rounded-md border border-border overflow-hidden">
                <div className="grid grid-cols-[52px_52px_1fr_60px] text-xs font-medium bg-muted px-2 py-1.5 text-muted-foreground">
                  <span>Min</span><span>Max</span><span>Outcome</span><span />
                </div>
                <div className="divide-y divide-border max-h-64 overflow-y-auto">
                  {rows.map((row, idx) => (
                    <div key={row._key} className="grid grid-cols-[52px_52px_1fr_60px] items-center gap-1 px-2 py-1">
                      <input type="number" value={row.min}
                        onChange={(e) => updateRow(row._key, { min: e.target.value === "" ? "" : parseInt(e.target.value, 10) })}
                        className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
                      <input type="number" value={row.max}
                        onChange={(e) => updateRow(row._key, { max: e.target.value === "" ? "" : parseInt(e.target.value, 10) })}
                        className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
                      <input type="text" value={row.outcome} onChange={(e) => updateRow(row._key, { outcome: e.target.value })}
                        className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
                      <div className="flex items-center justify-end gap-0.5">
                        <IconButton variant="ghost" size="icon-xs" onClick={() => moveRow(idx, -1)} disabled={idx === 0} className="size-5" tooltip="Move row up">
                          <ChevronUpIcon className="size-3" />
                        </IconButton>
                        <IconButton variant="ghost" size="icon-xs" onClick={() => moveRow(idx, 1)} disabled={idx === rows.length - 1} className="size-5" tooltip="Move row down">
                          <ChevronDownIcon className="size-3" />
                        </IconButton>
                        <IconButton variant="ghost" size="icon-xs" onClick={() => removeRow(row._key)} className="size-5 hover:text-destructive" tooltip="Remove row">
                          <XIcon className="size-3" />
                        </IconButton>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <Button variant="ghost" size="xs" onClick={addRow} className="mt-1.5 text-muted-foreground">
                <PlusIcon />
                Add row
              </Button>
            </div>
          )}

          {/* Modifiers tab */}
          {tab === "modifiers" && (
            <div className="space-y-3">
              {modifiers.map((mod) => (
                <ModifierEditor
                  key={mod._key}
                  mod={mod}
                  regions={regions}
                  onChange={(patch) => updateModifier(mod._key, patch)}
                  onBehaviorChange={(b) => setBehavior(mod._key, b)}
                  onRemove={() => removeModifier(mod._key)}
                />
              ))}
              <Button variant="ghost" size="xs" onClick={addModifier} className="text-muted-foreground">
                <PlusIcon />
                Add modifier
              </Button>

              {/* Presets */}
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Modifier presets</p>

                {/* Apply preset */}
                {presets.length > 0 && (
                  <div className="space-y-1.5">
                    {presets.map((p) => (
                      <div key={p.id} className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const incoming: EditableModifier[] = p.modifiers.map((m) => ({
                              ...m,
                              _key: crypto.randomUUID(),
                            }));
                            setModifiers((prev) => [...prev, ...incoming]);
                          }}
                          className="flex-1 text-left text-xs px-2 py-1 rounded border border-border hover:border-primary hover:text-primary transition-colors truncate"
                        >
                          {p.name}
                          <span className="ml-1.5 text-muted-foreground font-normal">
                            ({p.modifiers.length} modifier{p.modifiers.length !== 1 ? "s" : ""})
                          </span>
                        </button>
                        <IconButton
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleDeletePreset(p.id)}
                          tooltip="Delete preset"
                          className="hover:text-destructive shrink-0"
                        >
                          <XIcon />
                        </IconButton>
                      </div>
                    ))}
                  </div>
                )}

                {/* Save as preset */}
                {showSavePreset ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={savePresetName}
                      onChange={(e) => setSavePresetName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSavePreset(); if (e.key === "Escape") setShowSavePreset(false); }}
                      placeholder="Preset name"
                      autoFocus
                      className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <Button
                      size="xs"
                      onClick={handleSavePreset}
                      disabled={!savePresetName.trim() || modifiers.length === 0}
                    >
                      Save
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => setShowSavePreset(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setShowSavePreset(true)}
                    disabled={modifiers.length === 0}
                    className="text-muted-foreground"
                  >
                    Save current modifiers as preset
                  </Button>
                )}
              </div>
            </div>
          )}

          {updateMutation.isError && (
            <p className="text-xs text-destructive">Save failed — please try again.</p>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <div>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-destructive">Delete this table?</span>
                <Button variant="destructive" size="xs" onClick={handleDelete} disabled={deleteMutation.isPending}>
                  {deleteMutation.isPending ? "Deleting…" : "Yes, delete"}
                </Button>
                <Button variant="ghost" size="xs" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} className="text-muted-foreground hover:text-destructive">
                Delete table
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button size="sm" onClick={handleSave} disabled={!canSave}>
              {updateMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modifier editor sub-component ───────────────────────────────────────────

interface ModifierEditorProps {
  mod: EditableModifier;
  regions: { id: string; name: string }[];
  onChange: (patch: Partial<EditableModifier>) => void;
  onBehaviorChange: (b: ModifierBehavior) => void;
  onRemove: () => void;
}

function ModifierEditor({ mod, regions, onChange, onBehaviorChange, onRemove }: ModifierEditorProps) {
  const prevCfg = mod.extraConfig?.type === "prev_result_condition" ? mod.extraConfig : null;

  function toggleRegion(list: "auto" | "conditional", id: string) {
    const key = list === "auto" ? "autoRegionIds" : "conditionalRegionIds";
    const current = list === "auto" ? mod.autoRegionIds : mod.conditionalRegionIds;
    onChange({ [key]: current.includes(id) ? current.filter((r) => r !== id) : [...current, id] });
  }

  return (
    <div className="rounded-md border border-border p-3 space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <input type="text" value={mod.label} onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Modifier label" className="flex-1 rounded border border-border bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary" />
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">±</span>
          <input type="number" value={mod.rollAdjustment}
            onChange={(e) => onChange({ rollAdjustment: parseInt(e.target.value) || 0 })}
            className="w-16 rounded border border-border bg-background px-2 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <IconButton variant="ghost" size="icon-xs" onClick={onRemove} className="hover:text-destructive" tooltip="Remove modifier">
          <XIcon />
        </IconButton>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Fires when:</span>
        <select value={mod.behavior} onChange={(e) => onBehaviorChange(e.target.value as ModifierBehavior)}
          className="rounded border border-border bg-background px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary">
          <option value="ALWAYS">Manually toggled (always visible)</option>
          <option value="AUTO_REGION">Auto — current region is one of…</option>
          <option value="CONDITIONAL_REGION">Toggle — only shown when region is one of…</option>
          <option value="PREV_RESULT_CONDITION">Auto — previous result meets condition</option>
        </select>
      </div>

      {(mod.behavior === "AUTO_REGION" || mod.behavior === "CONDITIONAL_REGION") && regions.length > 0 && (
        <div>
          <p className="text-muted-foreground mb-1">
            {mod.behavior === "AUTO_REGION" ? "Auto-fires in regions:" : "Shown as toggle in regions:"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {regions.map((r) => {
              const list = mod.behavior === "AUTO_REGION" ? mod.autoRegionIds : mod.conditionalRegionIds;
              const active = list.includes(r.id);
              return (
                <button key={r.id}
                  onClick={() => toggleRegion(mod.behavior === "AUTO_REGION" ? "auto" : "conditional", r.id)}
                  className={["px-2 py-0.5 rounded-full border transition-colors",
                    active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary"
                  ].join(" ")}
                >{r.name}</button>
              );
            })}
          </div>
        </div>
      )}

      {mod.behavior === "PREV_RESULT_CONDITION" && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Previous result</span>
          <select
            value={prevCfg?.operator ?? "lte"}
            onChange={(e) => onChange({
              extraConfig: { type: "prev_result_condition", operator: e.target.value as "lte" | "gte" | "eq", threshold: prevCfg?.threshold ?? 2 }
            })}
            className="rounded border border-border bg-background px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="lte">≤</option>
            <option value="gte">≥</option>
            <option value="eq">=</option>
          </select>
          <input type="number"
            value={prevCfg?.threshold ?? 2}
            onChange={(e) => onChange({
              extraConfig: { type: "prev_result_condition", operator: prevCfg?.operator ?? "lte", threshold: parseInt(e.target.value) || 0 }
            })}
            className="w-16 rounded border border-border bg-background px-2 py-0.5 font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-muted-foreground text-[10px]">(uses post-modifier score from last roll)</span>
        </div>
      )}
    </div>
  );
}
