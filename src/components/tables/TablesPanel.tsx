"use client";

import { useState, useEffect, useRef } from "react";
import type { TableCategory, TableRollResult } from "@/types/table";
import { useRandomTables, useRollTable } from "@/hooks/useRandomTables";
import { getVisibleModifiers } from "@/lib/tables/modifier-resolver";
import { TableRollResultDisplay } from "./TableRollResultDisplay";
import { ModifierToggleBar } from "./ModifierToggleBar";
import { TableImportWizard } from "./TableImportWizard";
import { TableManagerModal } from "./TableManagerModal";
import { TableCard } from "./TableCard";
import { Combobox } from "@/components/ui/Combobox";
import type { EncounterWindow } from "@/lib/encounter-timing";
import { rollEncounterTime } from "@/lib/encounter-timing";

interface Props {
  campaignId: string;
  category: TableCategory;
  currentRegionId: string | null;
  regions: { id: string; name: string }[];
  title: string;
  defaultSurpriseDice?: string | null;
  defaultSurpriseThreshold?: number | null;
  encounterWindows?: EncounterWindow[];
  encounterTableOverrideId?: string | null;
  mode?: string; // "OVERLAND" | "DUNGEON"
  onSendToCombat?: (name: string, count: number) => void;
  initialLastResult?: TableRollResult | null;
  initialLastEncounterTime?: string | null;
  onEncounterResultChange?: (result: TableRollResult | null, encounterTime: string | null, tableApplicableModes?: string | null) => void;
}

export function TablesPanel({ campaignId, category, currentRegionId, regions, title, defaultSurpriseDice, defaultSurpriseThreshold, encounterWindows = [], encounterTableOverrideId, mode, onSendToCombat, initialLastResult, initialLastEncounterTime, onEncounterResultChange }: Props) {
  const [showImport, setShowImport] = useState(false);
  const [showReactionImport, setShowReactionImport] = useState(false);
  const [showMoraleImport, setShowMoraleImport] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const [showReactionManager, setShowReactionManager] = useState(false);
  const [showMoraleManager, setShowMoraleManager] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [activeToggles, setActiveToggles] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<TableRollResult | null>(initialLastResult ?? null);
  const [selectedWindowIdx, setSelectedWindowIdx] = useState<number>(-1); // -1 = none
  const [timingMode, setTimingMode] = useState<"none" | "window">("none");
  const [lastEncounterTime, setLastEncounterTime] = useState<string | null>(initialLastEncounterTime ?? null);
  const [collapsed, setCollapsed] = useState(false);
  const [reactionsCollapsed, setReactionsCollapsed] = useState(false);

  const { data: tables = [], isLoading } = useRandomTables(campaignId, category);
  const { data: reactionTables = [] } = useRandomTables(campaignId, "REACTION");
  const { data: moraleTables = [] } = useRandomTables(campaignId, "MORALE");
  const rollMutation = useRollTable();

  const isEncounter = category === "ENCOUNTER";
  const modeTables = mode
    ? tables.filter((t) => {
        const m = t.applicableModes ?? "BOTH";
        return m === "BOTH" || m === mode;
      })
    : tables;
  const sorted = modeTables.slice().sort((a, b) => a.name.localeCompare(b.name));

  // Track previous values to distinguish initial mount from genuine dep changes.
  // Initialized to the current values so the first effect run sees no "change".
  const prevRegionIdRef = useRef<string | null>(currentRegionId);
  const prevOverrideIdRef = useRef<string | null | undefined>(encounterTableOverrideId);

  useEffect(() => {
    if (sorted.length === 0) return;

    const regionChanged = prevRegionIdRef.current !== currentRegionId;
    const overrideChanged = prevOverrideIdRef.current !== encounterTableOverrideId;
    prevRegionIdRef.current = currentRegionId;
    prevOverrideIdRef.current = encounterTableOverrideId;

    // Determine target table: override > region-scoped > fallback
    let targetId: string | null = null;
    if (encounterTableOverrideId) {
      targetId = encounterTableOverrideId;
    } else if (currentRegionId) {
      targetId = sorted.find((t) => t.regionIds.includes(currentRegionId))?.id ?? null;
    }
    // Fall back to first table when there is no selection yet, or when an
    // override was just cleared (need to move off the old override table).
    if (!targetId && (!selectedTableId || (overrideChanged && !encounterTableOverrideId))) {
      targetId = sorted[0]?.id ?? null;
    }

    if (targetId && targetId !== selectedTableId) {
      setSelectedTableId(targetId);
      // Only wipe the roll result when the user actually changed region/override,
      // not on initial mount or when tables first load into cache.
      if (regionChanged || overrideChanged) {
        setLastResult(null);
        setActiveToggles([]);
        setLastEncounterTime(null);
        setTimingMode("none");
        setSelectedWindowIdx(-1);
      }
    } else if (!selectedTableId && sorted[0]) {
      setSelectedTableId(sorted[0].id);
    }
  }, [sorted.length, currentRegionId, encounterTableOverrideId]);

  useEffect(() => {
    if (onEncounterResultChange) {
      onEncounterResultChange(lastResult, lastEncounterTime, lastResult ? (selectedTable?.applicableModes ?? null) : null);
    }
  }, [lastResult, lastEncounterTime]);

  const selectedTable = sorted.find((t) => t.id === selectedTableId) ?? null;
  const visibleModifiers = selectedTable ? getVisibleModifiers(selectedTable, currentRegionId) : [];

  function toggleModifier(id: string) {
    setActiveToggles((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }

  async function handleRoll() {
    if (!selectedTable) return;
    const result = await rollMutation.mutateAsync({
      tableId: selectedTable.id,
      campaignId,
      currentRegionId,
      userToggles: activeToggles,
    });
    setLastResult(result);
    if (isEncounter && timingMode === "window" && encounterWindows[selectedWindowIdx]) {
      setLastEncounterTime(rollEncounterTime(encounterWindows[selectedWindowIdx]));
    } else {
      setLastEncounterTime(null);
    }
  }

  const accentBorder = category === "ENCOUNTER"
    ? "border-t-blue-400 dark:border-t-blue-500"
    : "border-t-teal-400 dark:border-t-teal-500";
  const accentChevron = category === "ENCOUNTER"
    ? "text-blue-400 dark:text-blue-500"
    : "text-teal-400 dark:text-teal-500";

  const chevron = (rotate: boolean) => (
    <svg
      className={["w-3 h-3 transition-transform", accentChevron, rotate ? "-rotate-90" : ""].join(" ")}
      fill="none" stroke="currentColor" viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );

  const uploadIcon = (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );

  const listIcon = (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  );

  const tableBody = (
    <div className="px-3 py-3 flex flex-col gap-4">
      {/* Table selector + Roll */}
      {isLoading ? (
        <div className="h-8 rounded border border-border bg-muted/30 animate-pulse" />
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-8">
          <p className="text-sm text-muted-foreground">No tables yet.</p>
          <button onClick={() => setShowImport(true)} className="mt-2 text-sm text-primary hover:underline">
            Import one to get started
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <Combobox
            items={sorted.map((t) => ({ id: t.id, label: t.name }))}
            value={selectedTableId}
            onChange={(id) => {
              setSelectedTableId(id);
              setLastResult(null);
              setActiveToggles([]);
              setLastEncounterTime(null);
              setTimingMode("none");
              setSelectedWindowIdx(-1);
            }}
            className="flex-1 min-w-0"
          />
          <button
            onClick={handleRoll}
            disabled={!selectedTable || rollMutation.isPending}
            className="px-3 py-1 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0"
          >
            {rollMutation.isPending ? "Rolling…" : "Roll"}
          </button>
        </div>
      )}

      {/* Time window toggles — ENCOUNTER only, only when windows are configured */}
      {isEncounter && encounterWindows.length > 0 && sorted.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {encounterWindows.map((w, i) => (
            <button
              key={i}
              onClick={() => {
                if (timingMode === "window" && selectedWindowIdx === i) {
                  setTimingMode("none");
                  setSelectedWindowIdx(-1);
                } else {
                  setTimingMode("window");
                  setSelectedWindowIdx(i);
                }
              }}
              className={[
                "px-2.5 py-1 rounded-full text-xs border transition-colors",
                timingMode === "window" && selectedWindowIdx === i
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
              ].join(" ")}
            >
              {w.name}
            </button>
          ))}
        </div>
      )}

      {/* Modifier toggles */}
      {visibleModifiers.length > 0 && (
        <ModifierToggleBar
          modifiers={visibleModifiers}
          activeToggles={activeToggles}
          onToggle={toggleModifier}
        />
      )}

      {/* Roll result + optional timing */}
      {lastResult && (
        <>
          <div className="flex items-center justify-between -mb-1">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Last Roll</span>
            <button
              onClick={() => { setLastResult(null); setLastEncounterTime(null); }}
              className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
              title="Clear result"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <TableRollResultDisplay result={lastResult} tableRows={selectedTable?.rows} onSendToCombat={isEncounter ? onSendToCombat : undefined} />
          {lastEncounterTime && (
            <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-md border border-border bg-muted/40 -mt-2">
              <svg className="w-3.5 h-3.5 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-muted-foreground">{encounterWindows[selectedWindowIdx]?.name} —</span>
              <span className="font-semibold text-foreground">{lastEncounterTime}</span>
            </div>
          )}
        </>
      )}

      {/* Reactions & Morale combined sub-section — ENCOUNTER panel only */}
      {isEncounter && (
        <div className="border-t border-border pt-3 flex flex-col gap-2">
          {/* Sub-section header with collapse toggle */}
          <button
            onClick={() => setReactionsCollapsed((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
            title={reactionsCollapsed ? "Expand Reactions & Morale" : "Collapse Reactions & Morale"}
          >
            {chevron(reactionsCollapsed)}
            Reactions &amp; Morale
          </button>

          {!reactionsCollapsed && (
            <div className="grid grid-cols-2 gap-4">
              {/* Reaction column */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reaction</span>
                    {reactionTables.length > 1 && (
                      <span className="text-xs text-amber-600" title="Only the first reaction table is used when rolling encounters">
                        ⚠
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {reactionTables.length > 0 && (
                      <button
                        onClick={() => setShowReactionManager(true)}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Manage reaction tables"
                      >
                        {listIcon}
                      </button>
                    )}
                    <button
                      onClick={() => setShowReactionImport(true)}
                      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Import reaction table"
                    >
                      {uploadIcon}
                    </button>
                  </div>
                </div>
                {reactionTables.length > 0 ? (
                  <div className="space-y-2">
                    {reactionTables.map((table) => (
                      <TableCard
                        key={table.id}
                        table={table}
                        campaignId={campaignId}
                        currentRegionId={currentRegionId}
                        regions={regions}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No reaction table yet.
                  </p>
                )}
              </div>

              {/* Morale column */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Morale</span>
                  <div className="flex items-center gap-1">
                    {moraleTables.length > 0 && (
                      <button
                        onClick={() => setShowMoraleManager(true)}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Manage morale tables"
                      >
                        {listIcon}
                      </button>
                    )}
                    <button
                      onClick={() => setShowMoraleImport(true)}
                      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Import morale table"
                    >
                      {uploadIcon}
                    </button>
                  </div>
                </div>
                {moraleTables.length > 0 ? (
                  <div className="space-y-2">
                    {moraleTables.map((table) => (
                      <TableCard
                        key={table.id}
                        table={table}
                        campaignId={campaignId}
                        currentRegionId={currentRegionId}
                        regions={regions}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No morale table yet.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const modals = (
    <>
      {showImport && (
        <TableImportWizard
          campaignId={campaignId}
          category={category}
          regions={regions}
          seasons={[]}
          onClose={() => setShowImport(false)}
          defaultSurpriseDice={defaultSurpriseDice}
          defaultSurpriseThreshold={defaultSurpriseThreshold}
        />
      )}
      {showReactionImport && (
        <TableImportWizard
          campaignId={campaignId}
          category="REACTION"
          regions={regions}
          seasons={[]}
          onClose={() => setShowReactionImport(false)}
        />
      )}
      {showMoraleImport && (
        <TableImportWizard
          campaignId={campaignId}
          category="MORALE"
          regions={regions}
          seasons={[]}
          onClose={() => setShowMoraleImport(false)}
        />
      )}
      {showManager && (
        <TableManagerModal
          title={`${title} Tables`}
          tables={tables}
          campaignId={campaignId}
          regions={regions}
          seasons={[]}
          onClose={() => setShowManager(false)}
        />
      )}
      {showReactionManager && (
        <TableManagerModal
          title="Reaction Tables"
          tables={reactionTables}
          campaignId={campaignId}
          regions={regions}
          seasons={[]}
          onClose={() => setShowReactionManager(false)}
        />
      )}
      {showMoraleManager && (
        <TableManagerModal
          title="Morale Tables"
          tables={moraleTables}
          campaignId={campaignId}
          regions={regions}
          seasons={[]}
          onClose={() => setShowMoraleManager(false)}
        />
      )}
    </>
  );

  return (
    <>
      <div className={`rounded-lg border border-border border-t-2 ${accentBorder} flex flex-col gap-0`}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            title={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          >
            {chevron(collapsed)}
            {title}
          </button>
          {!collapsed && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowImport(true)}
                className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Import table"
              >
                {uploadIcon}
              </button>
              {tables.length > 0 && (
                <button
                  onClick={() => setShowManager(true)}
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Browse / edit tables"
                >
                  {listIcon}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Collapsible body */}
        {!collapsed && tableBody}
      </div>
      {modals}
    </>
  );
}
