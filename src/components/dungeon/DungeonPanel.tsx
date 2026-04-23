"use client";

import { useState } from "react";
import type { EncounterSummary } from "@/hooks/useCalendar";
import { extractCombatantInfo } from "@/lib/combat-prefill";
import {
  useDungeonConfig,
  useSaveDungeonConfig,
  useLightSources,
  useCreateLightSourceType,
  useUpdateLightSourceType,
  useDeleteLightSourceType,
  useActivateLightSource,
  useUpdateActiveLightSource,
  useDeleteActiveLightSource,
  useAdvanceTurn,
  type ActiveLightSource,
  type LightSourceType,
} from "@/hooks/useDungeon";

interface Props {
  campaignId: string;
  currentTime: string;
  currentDungeonRegionId: string | null;
  onTimeChange: (time: string) => void;
  encounterTableOverrideId: string | null;
  onSendToCombat?: (name: string, count: number) => void;
}

export function DungeonPanel({
  campaignId,
  currentTime,
  currentDungeonRegionId,
  onTimeChange,
  encounterTableOverrideId,
  onSendToCombat,
}: Props) {
  const { data: config } = useDungeonConfig(campaignId);
  const { data: lightData, isLoading: lightsLoading } = useLightSources(campaignId);
  const saveDungeonConfig = useSaveDungeonConfig(campaignId);
  const advanceTurn = useAdvanceTurn(campaignId);

  const [collapsed, setCollapsed] = useState(false);
  const [encounter, setEncounter] = useState<EncounterSummary | null>(null);
  const [turnInfo, setTurnInfo] = useState<{ turn: number; total: number } | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showLightTypes, setShowLightTypes] = useState(false);
  const [showActivateForm, setShowActivateForm] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [timeInput, setTimeInput] = useState(currentTime);

  const createType = useCreateLightSourceType(campaignId);
  const updateType = useUpdateLightSourceType(campaignId);
  const deleteType = useDeleteLightSourceType(campaignId);
  const activateLight = useActivateLightSource(campaignId);
  const updateActive = useUpdateActiveLightSource(campaignId);
  const deleteActive = useDeleteActiveLightSource(campaignId);

  async function handleAdvanceTurn() {
    const result = await advanceTurn.mutateAsync({
      currentTime,
      currentDungeonRegionId,
      encounterTableOverrideId,
    });
    onTimeChange(result.newTime);
    setTurnInfo({ turn: result.turnInHour, total: result.turnsPerHour });
    setEncounter(result.encounter);
  }

  function confirmSetTime() {
    const t = timeInput.trim();
    if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(t)) {
      const normalized = t.replace(/\s*(AM|PM)/i, (m) => ` ${m.toUpperCase()}`);
      onTimeChange(normalized);
    }
    setEditingTime(false);
  }

  const turnsPerHour = config?.turnsPerHour ?? 6;
  const minutesPerTurn = 60 / turnsPerHour;
  const activeLights = lightData?.active ?? [];
  const lightTypes = lightData?.types ?? [];

  return (
    <div className="rounded-lg border border-border border-t-2 border-t-orange-400 dark:border-t-orange-500 flex flex-col gap-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          title={collapsed ? "Expand Dungeon Exploration" : "Collapse Dungeon Exploration"}
        >
          <svg
            className={["w-3 h-3 transition-transform text-orange-400 dark:text-orange-500", collapsed ? "-rotate-90" : ""].join(" ")}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          Dungeon Exploration
        </button>
        {!collapsed && (
          <button
            onClick={() => setShowConfig((v) => !v)}
            title="Configure dungeon settings"
            className="text-muted-foreground hover:text-foreground"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
      </div>

      {!collapsed && (<>

      {/* Config panel */}
      {showConfig && config && (
        <DungeonConfigEditor
          config={config}
          onSave={async (data) => { await saveDungeonConfig.mutateAsync(data); setShowConfig(false); }}
          onClose={() => setShowConfig(false)}
          isSaving={saveDungeonConfig.isPending}
        />
      )}

      {/* Time + Advance Turn */}
      <div className="px-3 py-2 border-b border-border space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {editingTime ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  type="text"
                  value={timeInput}
                  onChange={(e) => setTimeInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmSetTime(); if (e.key === "Escape") setEditingTime(false); }}
                  placeholder="9:30 AM"
                  className="w-24 rounded border border-border bg-background px-2 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button onClick={confirmSetTime} className="text-xs px-1.5 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90">Set</button>
                <button onClick={() => setEditingTime(false)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
              </div>
            ) : (
              <button
                onClick={() => { setTimeInput(currentTime); setEditingTime(true); }}
                className="text-sm font-semibold hover:text-primary transition-colors"
                title="Click to set time"
              >
                {currentTime}
              </button>
            )}
          </div>
          {turnInfo && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              Turn {turnInfo.turn}/{turnInfo.total}
            </span>
          )}
        </div>
        {config && (
          <p className="text-[10px] text-muted-foreground">
            {turnsPerHour} turns/hour · {minutesPerTurn % 1 === 0 ? minutesPerTurn : minutesPerTurn.toFixed(1)} min/turn
            {config.encounterTurns.length > 0 && (
              <> · encounter checks on turns {config.encounterTurns.join(", ")}</>
            )}
          </p>
        )}
        <button
          onClick={handleAdvanceTurn}
          disabled={advanceTurn.isPending}
          className="w-full py-1 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {advanceTurn.isPending ? "Advancing…" : "Advance Turn"}
        </button>
      </div>

      {/* Encounter result */}
      {encounter && (
        <div className="px-3 py-2 border-b border-border bg-muted/50 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              {encounter.label}{encounter.time ? ` — ${encounter.time}` : ""}
            </span>
            <button onClick={() => setEncounter(null)} className="text-muted-foreground hover:text-foreground">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {(() => {
            const combatInfo = onSendToCombat ? extractCombatantInfo(encounter.outcome) : null;
            return (
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs">{encounter.outcome}</p>
                {combatInfo && (
                  <button
                    onClick={() => onSendToCombat!(combatInfo.name, combatInfo.count)}
                    className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-foreground/40 rounded px-1.5 py-0.5 transition-colors"
                    title={`Send to Combat: ${combatInfo.count}× ${combatInfo.name}`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Combat
                  </button>
                )}
              </div>
            );
          })()}
          {encounter.reaction && (
            <p className="text-xs text-muted-foreground">Reaction: {encounter.reaction.outcome}</p>
          )}
          {encounter.surprise && (
            <p className={["text-xs", encounter.surprise.surprised ? "text-amber-700" : "text-muted-foreground"].join(" ")}>
              {encounter.surprise.surprised
                ? `Surprised! (rolled ${encounter.surprise.roll} on ${encounter.surprise.dice})`
                : `Not surprised (${encounter.surprise.dice}: ${encounter.surprise.roll})`}
            </p>
          )}
        </div>
      )}

      {/* Light sources */}
      <div className="px-3 py-2 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Light Sources</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowLightTypes((v) => !v)}
              title="Manage light source types"
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={() => setShowActivateForm((v) => !v)}
              title="Activate a light source"
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>

        {/* Active light source list */}
        {!lightsLoading && activeLights.length === 0 && (
          <p className="text-xs text-muted-foreground">No active light sources.</p>
        )}
        {activeLights.map((light) => (
          <ActiveLightCard
            key={light.id}
            light={light}
            onUpdate={(patch) => updateActive.mutateAsync({ id: light.id, ...patch })}
            onDelete={() => deleteActive.mutateAsync(light.id)}
          />
        ))}

        {/* Activate form */}
        {showActivateForm && (
          <ActivateLightForm
            types={lightTypes}
            onActivate={async (data) => { await activateLight.mutateAsync(data); setShowActivateForm(false); }}
            onClose={() => setShowActivateForm(false)}
            isPending={activateLight.isPending}
          />
        )}

        {/* Light type manager */}
        {showLightTypes && (
          <LightTypeManager
            types={lightTypes}
            onCreate={(data) => createType.mutateAsync(data)}
            onUpdate={(id, data) => updateType.mutateAsync({ id, ...data })}
            onDelete={(id) => deleteType.mutateAsync(id)}
            isCreating={createType.isPending}
          />
        )}
      </div>

      </>)}
    </div>
  );
}

// ─── Dungeon Config Editor ────────────────────────────────────────────────────

function DungeonConfigEditor({
  config,
  onSave,
  onClose,
  isSaving,
}: {
  config: { turnsPerHour: number; encounterTurns: number[] };
  onSave: (data: { turnsPerHour: number; encounterTurns: number[] }) => void;
  onClose: () => void;
  isSaving: boolean;
}) {
  const [turnsPerHour, setTurnsPerHour] = useState(config.turnsPerHour);
  const [encounterTurnsStr, setEncounterTurnsStr] = useState(config.encounterTurns.join(", "));

  const parsedTurns = encounterTurnsStr
    .split(",")
    .map((s) => parseInt(s.trim()))
    .filter((n) => !isNaN(n) && n >= 1 && n <= turnsPerHour);

  function handleSave() {
    onSave({ turnsPerHour, encounterTurns: parsedTurns });
  }

  return (
    <div className="px-3 py-2 border-b border-border bg-muted/30 space-y-3 text-xs">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-muted-foreground whitespace-nowrap">Turns/hour</label>
          <input
            type="number"
            min={1}
            max={60}
            value={turnsPerHour}
            onChange={(e) => setTurnsPerHour(Math.max(1, parseInt(e.target.value) || 6))}
            className="w-16 rounded border border-border bg-background px-2 py-1 font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-2 flex-1">
          <label className="text-muted-foreground whitespace-nowrap">Encounter turns</label>
          <input
            type="text"
            value={encounterTurnsStr}
            onChange={(e) => setEncounterTurnsStr(e.target.value)}
            placeholder="e.g. 2, 5"
            className="flex-1 rounded border border-border bg-background px-2 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
      <p className="text-muted-foreground/70">
        {turnsPerHour} turns/hour = {(60 / turnsPerHour) % 1 === 0 ? 60 / turnsPerHour : (60 / turnsPerHour).toFixed(1)} min/turn.
        Encounter checks on turns: {parsedTurns.length > 0 ? parsedTurns.join(", ") : "none"}.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-2.5 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">Cancel</button>
      </div>
    </div>
  );
}

// ─── Active light source card ─────────────────────────────────────────────────

function ActiveLightCard({
  light,
  onUpdate,
  onDelete,
}: {
  light: ActiveLightSource;
  onUpdate: (patch: { remainingTurns?: number; paused?: boolean; carrierName?: string }) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
}) {
  const [editingTurns, setEditingTurns] = useState(false);
  const [turnsInput, setTurnsInput] = useState(String(light.remainingTurns));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isEmpty = light.remainingTurns === 0;
  const isLow = light.remainingTurns > 0 && light.remainingTurns <= 2;
  const isHealthy = light.remainingTurns > 5;

  return (
    <div className={[
      "rounded-md border px-2.5 py-2 space-y-1",
      isEmpty   ? "border-destructive/50 bg-destructive/5"
      : isLow   ? "border-amber-400/60 bg-amber-50/40 dark:bg-amber-950/20"
      : isHealthy ? "border-green-300 bg-green-50/30 dark:border-green-800 dark:bg-green-950/20"
      : "border-border bg-card",
    ].join(" ")}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium truncate">{light.name}</p>
          <p className="text-[10px] text-muted-foreground">{light.carrierName}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Remaining turns display / edit */}
          {editingTurns ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                type="number"
                min={0}
                value={turnsInput}
                onChange={(e) => setTurnsInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = parseInt(turnsInput);
                    if (!isNaN(v) && v >= 0) onUpdate({ remainingTurns: v });
                    setEditingTurns(false);
                  }
                  if (e.key === "Escape") setEditingTurns(false);
                }}
                className="w-14 rounded border border-border bg-background px-1.5 py-0.5 text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={() => {
                  const v = parseInt(turnsInput);
                  if (!isNaN(v) && v >= 0) onUpdate({ remainingTurns: v });
                  setEditingTurns(false);
                }}
                className="text-[10px] text-primary hover:underline"
              >Set</button>
            </div>
          ) : (
            <button
              onClick={() => { setTurnsInput(String(light.remainingTurns)); setEditingTurns(true); }}
              className={[
                "text-xs font-mono font-semibold px-1.5 py-0.5 rounded border transition-colors",
                isEmpty   ? "border-destructive text-destructive"
                : isLow   ? "border-amber-500 text-amber-600"
                : isHealthy ? "border-green-400 text-green-700 dark:text-green-400"
                : "border-border text-foreground hover:border-primary",
              ].join(" ")}
              title="Click to edit remaining turns"
            >
              {isEmpty ? "out" : `${light.remainingTurns}t`}
            </button>
          )}
          {/* Pause/resume */}
          <button
            onClick={() => onUpdate({ paused: !light.paused })}
            title={light.paused ? "Resume countdown" : "Pause countdown"}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {light.paused ? (
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            ) : (
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            )}
          </button>
          {/* Delete */}
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button onClick={() => onDelete()} className="text-[10px] text-destructive hover:underline">End</button>
              <button onClick={() => setConfirmDelete(false)} className="text-[10px] text-muted-foreground hover:text-foreground">✕</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              title="End this light source"
              className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {light.paused && <p className="text-[10px] text-muted-foreground italic">Paused</p>}
      {isEmpty && <p className="text-[10px] text-destructive font-medium">Expired — refill or end</p>}
    </div>
  );
}

// ─── Activate light source form ───────────────────────────────────────────────

function ActivateLightForm({
  types,
  onActivate,
  onClose,
  isPending,
}: {
  types: LightSourceType[];
  onActivate: (data: { typeId?: string | null; name: string; carrierName: string; remainingTurns: number }) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
  const [customName, setCustomName] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const [duration, setDuration] = useState<number | "">(1);

  const selectedType = types.find((t) => t.id === selectedTypeId) ?? null;

  function handleTypeChange(id: string) {
    setSelectedTypeId(id);
    const t = types.find((x) => x.id === id);
    if (t) {
      setCustomName(t.name);
      setDuration(t.defaultDuration);
    } else {
      setCustomName("");
      setDuration(1);
    }
  }

  function handleActivate() {
    const name = customName.trim() || selectedType?.name || "Light";
    const carrier = carrierName.trim();
    if (!carrier || !duration) return;
    onActivate({ typeId: selectedTypeId || null, name, carrierName: carrier, remainingTurns: Number(duration) });
  }

  return (
    <div className="rounded-md border border-border bg-muted/30 p-2.5 space-y-2 text-xs">
      <p className="font-medium text-foreground">Activate light source</p>
      {types.length > 0 && (
        <div>
          <label className="text-muted-foreground block mb-0.5">Type (optional)</label>
          <select
            value={selectedTypeId}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">— Custom —</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.defaultDuration}t)</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="text-muted-foreground block mb-0.5">Name</label>
        <input
          type="text"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder="Torch, Lantern…"
          className="w-full rounded border border-border bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="text-muted-foreground block mb-0.5">Carried by</label>
          <input
            type="text"
            value={carrierName}
            onChange={(e) => setCarrierName(e.target.value)}
            placeholder="Character name"
            className="w-full rounded border border-border bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="text-muted-foreground block mb-0.5">Turns</label>
          <input
            type="number"
            min={1}
            value={duration}
            onChange={(e) => setDuration(e.target.value === "" ? "" : Math.max(1, parseInt(e.target.value) || 1))}
            className="w-16 rounded border border-border bg-background px-2 py-1 font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
      <div className="flex items-center gap-2 pt-0.5">
        <button
          onClick={handleActivate}
          disabled={isPending || !carrierName.trim() || !duration}
          className="px-2.5 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? "Activating…" : "Activate"}
        </button>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">Cancel</button>
      </div>
    </div>
  );
}

// ─── Light type manager ───────────────────────────────────────────────────────

function LightTypeManager({
  types,
  onCreate,
  onUpdate,
  onDelete,
  isCreating,
}: {
  types: LightSourceType[];
  onCreate: (data: { name: string; defaultDuration: number }) => Promise<unknown>;
  onUpdate: (id: string, data: { name?: string; defaultDuration?: number }) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  isCreating: boolean;
}) {
  const [newName, setNewName] = useState("");
  const [newDuration, setNewDuration] = useState<number | "">(6);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDuration, setEditDuration] = useState<number | "">(1);

  function startEdit(t: LightSourceType) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditDuration(t.defaultDuration);
  }

  async function submitEdit(id: string) {
    await onUpdate(id, { name: editName.trim() || undefined, defaultDuration: Number(editDuration) || undefined });
    setEditingId(null);
  }

  return (
    <div className="rounded-md border border-border bg-muted/30 p-2.5 space-y-2 text-xs">
      <p className="font-medium text-foreground">Light source types</p>
      {types.length === 0 && <p className="text-muted-foreground">No types defined yet.</p>}
      {types.map((t) => (
        <div key={t.id} className="flex items-center gap-2">
          {editingId === t.id ? (
            <>
              <input
                autoFocus
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitEdit(t.id); if (e.key === "Escape") setEditingId(null); }}
                className="flex-1 rounded border border-border bg-background px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                type="number"
                min={1}
                value={editDuration}
                onChange={(e) => setEditDuration(e.target.value === "" ? "" : parseInt(e.target.value))}
                className="w-14 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-muted-foreground">t</span>
              <button onClick={() => submitEdit(t.id)} className="text-primary hover:underline">Save</button>
              <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </>
          ) : (
            <>
              <span className="flex-1 truncate">{t.name}</span>
              <span className="text-muted-foreground font-mono">{t.defaultDuration}t</span>
              <button onClick={() => startEdit(t)} className="p-0.5 text-muted-foreground hover:text-foreground">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button onClick={() => onDelete(t.id)} className="p-0.5 text-muted-foreground hover:text-destructive">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          )}
        </div>
      ))}
      {/* New type form */}
      <div className="flex items-center gap-2 pt-1 border-t border-border">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim() && newDuration) {
              onCreate({ name: newName.trim(), defaultDuration: Number(newDuration) });
              setNewName("");
              setNewDuration(6);
            }
          }}
          placeholder="Name"
          className="flex-1 rounded border border-border bg-background px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <input
          type="number"
          min={1}
          value={newDuration}
          onChange={(e) => setNewDuration(e.target.value === "" ? "" : parseInt(e.target.value))}
          className="w-14 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <span className="text-muted-foreground">t</span>
        <button
          onClick={() => {
            if (newName.trim() && newDuration) {
              onCreate({ name: newName.trim(), defaultDuration: Number(newDuration) });
              setNewName("");
              setNewDuration(6);
            }
          }}
          disabled={isCreating || !newName.trim() || !newDuration}
          className="px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
