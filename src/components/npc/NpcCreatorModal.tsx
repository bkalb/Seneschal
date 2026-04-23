"use client";

import { useState, useCallback } from "react";
import type { NpcProfile, NpcProfileConfig, GenderSelection, Gender } from "@/types/npc";
import type { RandomTable } from "@/types/table";
import { rollOnTable } from "@/lib/tables/engine";
import { resolveGender, resolveNameTable } from "@/lib/npc/generator";
import { useSaveSingleNpc } from "@/hooks/useSavedNpcs";
import { rollExpression, isValidDiceExpression } from "@/lib/dice/roller";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldState {
  value: string;
  tableId: string | null;
}

interface DetailFieldState extends FieldState {
  label: string;
}

interface CreatorState {
  gender: GenderSelection;
  name: FieldState;
  type: FieldState;
  secondaryType: FieldState | null;
  age: FieldState;
  physical: FieldState[];
  personality: FieldState[];
  details: DetailFieldState[];
}

interface Props {
  profile: NpcProfile;
  tables: RandomTable[];
  currentRegionId: string | null;
  campaignId: string;
  onClose: () => void;
  onSaved: () => void;
}

// ─── Build initial state from profile config ──────────────────────────────────

function initState(config: NpcProfileConfig): CreatorState {
  return {
    gender: "random",
    name: { value: "", tableId: null }, // name table resolved dynamically via tags
    type: { value: "", tableId: config.typeTableId },
    secondaryType: config.secondaryTypeLabel
      ? { value: "", tableId: config.secondaryTypeTableId }
      : null,
    age: { value: "", tableId: config.ageTableId },
    physical:
      config.physicalTableIds.length > 0
        ? config.physicalTableIds.map((id) => ({ value: "", tableId: id }))
        : [{ value: "", tableId: null }],
    personality:
      config.personalityTableIds.length > 0
        ? config.personalityTableIds.map((id) => ({ value: "", tableId: id }))
        : [{ value: "", tableId: null }],
    details: config.detailTableIds.map(({ label, tableId }) => ({
      value: "",
      tableId,
      label,
    })),
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const GENDER_OPTIONS: { value: GenderSelection; label: string }[] = [
  { value: "female", label: "F" },
  { value: "random", label: "?" },
  { value: "male", label: "M" },
];

function RollButton({
  onClick,
  disabled,
  "aria-label": ariaLabel,
}: {
  onClick: () => void;
  disabled?: boolean;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 p-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
      title="Roll on table"
      aria-label={ariaLabel}
    >
      🎲
    </button>
  );
}

function CreatorField({
  label,
  field,
  onChange,
  onRoll,
  placeholder,
}: {
  label: string;
  field: FieldState;
  onChange: (value: string) => void;
  onRoll?: () => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] font-semibold text-muted-foreground w-24 shrink-0">
        {label}
      </label>
      <input
        type="text"
        value={field.value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? `Enter ${label.toLowerCase()}…`}
        className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        aria-label={label}
      />
      {onRoll && (
        <RollButton onClick={onRoll} aria-label={`Roll ${label}`} />
      )}
    </div>
  );
}

function ListFields({
  label,
  fields,
  onChange,
  onRoll,
  onAdd,
  canAdd,
}: {
  label: string;
  fields: FieldState[];
  onChange: (idx: number, value: string) => void;
  onRoll?: (idx: number) => void;
  onAdd: () => void;
  canAdd: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {fields.map((f, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground w-24 shrink-0">
            {idx === 0 ? label : ""}
          </span>
          <input
            type="text"
            value={f.value}
            onChange={(e) => onChange(idx, e.target.value)}
            placeholder={`Enter ${label.toLowerCase()}…`}
            className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label={`${label} ${idx + 1}`}
          />
          {onRoll && f.tableId ? (
            <RollButton onClick={() => onRoll(idx)} aria-label={`Roll ${label} ${idx + 1}`} />
          ) : (
            <div className="w-8 shrink-0" /> /* spacer to align with rows that have roll buttons */
          )}
        </div>
      ))}
      {canAdd && (
        <div className="flex items-center gap-2">
          <span className="w-24 shrink-0" />
          <button
            type="button"
            onClick={onAdd}
            className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
            aria-label={`Add ${label} trait`}
          >
            + Add {label.toLowerCase()}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NpcCreatorModal({
  profile,
  tables,
  currentRegionId,
  campaignId,
  onClose,
  onSaved,
}: Props) {
  const [state, setState] = useState<CreatorState>(() => initState(profile.config));
  const tableMap = new Map(tables.map((t) => [t.id, t]));
  const saveMutation = useSaveSingleNpc(campaignId);

  const [isCombatant, setIsCombatant] = useState(false);
  const [combatAc, setCombatAc] = useState("");
  const [combatHd, setCombatHd] = useState("1d8");
  const [combatMaxHp, setCombatMaxHp] = useState("");
  const [combatAttackBonus, setCombatAttackBonus] = useState("0");
  const [combatAttackDamage, setCombatAttackDamage] = useState("1d6");

  function rollCombatHp() {
    try {
      if (isValidDiceExpression(combatHd)) {
        setCombatMaxHp(String(rollExpression(combatHd).total));
      }
    } catch {}
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function roll(tableId: string): string {
    const table = tableMap.get(tableId);
    if (!table) return "";
    return rollOnTable(table, currentRegionId, []).resolvedOutcome.expandedText;
  }

  function resolvedGender(): Gender {
    return resolveGender(state.gender);
  }

  // ── Field updaters ─────────────────────────────────────────────────────────

  const setName = (value: string) =>
    setState((s) => ({ ...s, name: { ...s.name, value } }));

  const setType = (value: string) =>
    setState((s) => ({ ...s, type: { ...s.type, value } }));

  const setSecondaryType = (value: string) =>
    setState((s) =>
      s.secondaryType ? { ...s, secondaryType: { ...s.secondaryType, value } } : s
    );

  const setAge = (value: string) =>
    setState((s) => ({ ...s, age: { ...s.age, value } }));

  const setPhysical = useCallback((idx: number, value: string) =>
    setState((s) => {
      const physical = [...s.physical];
      physical[idx] = { ...physical[idx], value };
      return { ...s, physical };
    }), []);

  const setPersonality = useCallback((idx: number, value: string) =>
    setState((s) => {
      const personality = [...s.personality];
      personality[idx] = { ...personality[idx], value };
      return { ...s, personality };
    }), []);

  const setDetail = useCallback((idx: number, value: string) =>
    setState((s) => {
      const details = [...s.details];
      details[idx] = { ...details[idx], value };
      return { ...s, details };
    }), []);

  // ── Roll handlers ──────────────────────────────────────────────────────────

  function rollName() {
    const gender = resolvedGender();
    const nameTable = resolveNameTable(tableMap, state.type.value || null, gender);
    if (!nameTable) return;
    setName(rollOnTable(nameTable, currentRegionId, []).resolvedOutcome.expandedText);
  }

  function rollType() {
    if (!state.type.tableId) return;
    setType(roll(state.type.tableId));
  }

  function rollSecondaryType() {
    if (!state.secondaryType?.tableId) return;
    setSecondaryType(roll(state.secondaryType.tableId));
  }

  function rollAge() {
    if (!state.age.tableId) return;
    setAge(roll(state.age.tableId));
  }

  const rollPhysical = useCallback((idx: number) => {
    setState((s) => {
      const tableId = s.physical[idx]?.tableId;
      if (!tableId) return s;
      const value = roll(tableId);
      const physical = [...s.physical];
      physical[idx] = { ...physical[idx], value };
      return { ...s, physical };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableMap, currentRegionId]);

  const rollPersonality = useCallback((idx: number) => {
    setState((s) => {
      const tableId = s.personality[idx]?.tableId;
      if (!tableId) return s;
      const value = roll(tableId);
      const personality = [...s.personality];
      personality[idx] = { ...personality[idx], value };
      return { ...s, personality };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableMap, currentRegionId]);

  const rollDetail = useCallback((idx: number) => {
    setState((s) => {
      const tableId = s.details[idx]?.tableId;
      if (!tableId) return s;
      const value = roll(tableId);
      const details = [...s.details];
      details[idx] = { ...details[idx], value };
      return { ...s, details };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableMap, currentRegionId]);

  // ── Add extra rows ─────────────────────────────────────────────────────────

  function addPhysical() {
    setState((s) => ({ ...s, physical: [...s.physical, { value: "", tableId: null }] }));
  }

  function addPersonality() {
    setState((s) => ({ ...s, personality: [...s.personality, { value: "", tableId: null }] }));
  }

  // ── Name table availability ────────────────────────────────────────────────

  const hasNameTables = [...tableMap.values()].some(
    (t) => t.category === "NPC" && (t.npcForType !== null || t.npcForGender !== null)
  );

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    const gender = resolvedGender();
    try {
      await saveMutation.mutateAsync({
        name: state.name.value.trim() || null,
        gender,
        age: state.age.value.trim() || null,
        type: state.type.value.trim() || null,
        typeLabel: profile.config.typeLabel,
        secondaryType: state.secondaryType?.value.trim() || null,
        secondaryTypeLabel: profile.config.secondaryTypeLabel,
        physical: state.physical.map((f) => f.value).filter((v) => v.trim() !== ""),
        personality: state.personality.map((f) => f.value).filter((v) => v.trim() !== ""),
        details: state.details
          .map((f) => ({ label: f.label, value: f.value }))
          .filter((d) => d.value.trim() !== ""),
        isCombatant,
        combatAc: isCombatant && combatAc ? parseInt(combatAc, 10) : null,
        combatHd: isCombatant ? combatHd || null : null,
        combatMaxHp: isCombatant && combatMaxHp ? parseInt(combatMaxHp, 10) : null,
        combatAttackBonus: isCombatant ? parseInt(combatAttackBonus, 10) || 0 : null,
        combatAttackDamage: isCombatant ? combatAttackDamage || null : null,
      });
      toast.success(`${state.name.value.trim() || "NPC"} saved`);
      onSaved();
      onClose();
    } catch {
      toast.error("Failed to save NPC");
    }
  }

  const config = profile.config;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Create NPC"
    >
      <div className="bg-background border border-border rounded-lg shadow-xl w-full max-w-sm mx-4 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border shrink-0">
          <div>
            <h2 className="font-semibold text-sm">Create NPC</h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">{profile.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close create NPC"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Gender */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-muted-foreground w-24 shrink-0">
              Gender
            </span>
            <div className="flex rounded border border-border overflow-hidden" role="group" aria-label="Gender">
              {GENDER_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setState((s) => ({ ...s, gender: value }))}
                  className={[
                    "px-3 py-1 text-xs transition-colors",
                    state.gender === value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  ].join(" ")}
                  aria-pressed={state.gender === value}
                  aria-label={value === "random" ? "Random gender" : value === "male" ? "Male" : "Female"}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <CreatorField
            label="Name"
            field={state.name}
            onChange={setName}
            onRoll={hasNameTables ? rollName : undefined}
            placeholder="Enter name…"
          />

          {/* Type */}
          <CreatorField
            label={config.typeLabel}
            field={state.type}
            onChange={setType}
            onRoll={state.type.tableId ? rollType : undefined}
          />

          {/* Secondary type */}
          {state.secondaryType !== null && config.secondaryTypeLabel && (
            <CreatorField
              label={config.secondaryTypeLabel}
              field={state.secondaryType}
              onChange={setSecondaryType}
              onRoll={state.secondaryType.tableId ? rollSecondaryType : undefined}
            />
          )}

          {/* Age */}
          <CreatorField
            label="Age"
            field={state.age}
            onChange={setAge}
            onRoll={state.age.tableId ? rollAge : undefined}
          />

          {/* Divider */}
          <div className="border-t border-border/60 pt-1" />

          {/* Physical */}
          <ListFields
            label="Physical"
            fields={state.physical}
            onChange={setPhysical}
            onRoll={rollPhysical}
            onAdd={addPhysical}
            canAdd
          />

          {/* Personality */}
          <ListFields
            label="Personality"
            fields={state.personality}
            onChange={setPersonality}
            onRoll={rollPersonality}
            onAdd={addPersonality}
            canAdd
          />

          {/* Detail rolls */}
          {state.details.length > 0 && (
            <>
              <div className="border-t border-border/60 pt-1" />
              {state.details.map((d, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <label className="text-[10px] font-semibold text-muted-foreground w-24 shrink-0">
                    {d.label}
                  </label>
                  <input
                    type="text"
                    value={d.value}
                    onChange={(e) => setDetail(idx, e.target.value)}
                    placeholder={`Enter ${d.label.toLowerCase()}…`}
                    className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    aria-label={d.label}
                  />
                  {d.tableId ? (
                    <RollButton onClick={() => rollDetail(idx)} aria-label={`Roll ${d.label}`} />
                  ) : (
                    <div className="w-8 shrink-0" />
                  )}
                </div>
              ))}
            </>
          )}

          {/* Combatant trait */}
          <div className="border-t border-border/60 pt-2 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isCombatant}
                onChange={(e) => setIsCombatant(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Combatant</span>
            </label>

            {isCombatant && (
              <div className="grid grid-cols-2 gap-2 pl-6">
                <div>
                  <label className="text-[10px] text-muted-foreground">AC</label>
                  <input
                    type="number"
                    value={combatAc}
                    onChange={(e) => setCombatAc(e.target.value)}
                    placeholder="9"
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary mt-0.5"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">HD</label>
                  <div className="flex gap-1 mt-0.5">
                    <input
                      type="text"
                      value={combatHd}
                      onChange={(e) => setCombatHd(e.target.value)}
                      placeholder="1d8"
                      className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={rollCombatHp}
                      className="px-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-xs"
                      title="Roll Max HP from HD"
                    >
                      ↺
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Max HP</label>
                  <input
                    type="number"
                    value={combatMaxHp}
                    onChange={(e) => setCombatMaxHp(e.target.value)}
                    placeholder="8"
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary mt-0.5"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Atk Bonus</label>
                  <input
                    type="number"
                    value={combatAttackBonus}
                    onChange={(e) => setCombatAttackBonus(e.target.value)}
                    placeholder="0"
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary mt-0.5"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-muted-foreground">Damage</label>
                  <input
                    type="text"
                    value={combatAttackDamage}
                    onChange={(e) => setCombatAttackDamage(e.target.value)}
                    placeholder="1d6"
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary mt-0.5"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="px-4 py-1.5 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
            aria-label="Save NPC"
          >
            {saveMutation.isPending ? "Saving…" : "Save NPC"}
          </button>
        </div>
      </div>
    </div>
  );
}
