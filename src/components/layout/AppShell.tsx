"use client";

import { useState, useEffect } from "react";
import TopBar from "./TopBar";
import RulesSectionList from "@/components/rules/RulesSectionList";
import { TablesPanel } from "@/components/tables/TablesPanel";
import { NpcPanel } from "@/components/npc/NpcPanel";
import { CalendarPanel } from "@/components/calendar/CalendarPanel";
import { DungeonPanel } from "@/components/dungeon/DungeonPanel";
import { CombatPanel } from "@/components/combat/CombatPanel";
import { FlagStrip } from "@/components/flags/FlagStrip";
import { RollHistoryPanel } from "@/components/history/RollHistoryPanel";
import type { CampaignFlag } from "@/hooks/useFlags";
import { parseEncounterWindows } from "@/lib/encounter-timing";
import type { TableRollResult } from "@/types/table";

export type ExplorationMode = "OVERLAND" | "DUNGEON" | "COMBAT";

type EncounterPersistedState = {
  lastResult: TableRollResult | null;
  lastEncounterTime: string | null;
  tableApplicableModes: string | null;
};
const EMPTY_ENCOUNTER: EncounterPersistedState = { lastResult: null, lastEncounterTime: null, tableApplicableModes: null };

function isCompatibleWithMode(tableApplicableModes: string | null, currentMode: "OVERLAND" | "DUNGEON"): boolean {
  if (!tableApplicableModes || tableApplicableModes === "BOTH") return true;
  return tableApplicableModes === currentMode;
}

function parseEncounterPanelState(json: string | null | undefined): { OVERLAND: EncounterPersistedState; DUNGEON: EncounterPersistedState } {
  if (json) {
    try {
      const parsed = JSON.parse(json) as { OVERLAND?: EncounterPersistedState; DUNGEON?: EncounterPersistedState };
      return {
        OVERLAND: parsed.OVERLAND ?? EMPTY_ENCOUNTER,
        DUNGEON: parsed.DUNGEON ?? EMPTY_ENCOUNTER,
      };
    } catch {}
  }
  return { OVERLAND: EMPTY_ENCOUNTER, DUNGEON: EMPTY_ENCOUNTER };
}

interface Campaign {
  id: string;
  name: string;
  defaultSurpriseDice: string | null;
  defaultSurpriseThreshold: number | null;
  defaultReactionTableId: string | null;
  defaultMoraleTableId: string | null;
  encounterWindowsJson: string;
  defaultCombatAC: number | null;
  defaultCombatHD: string | null;
  defaultCombatAttackBonus: number | null;
  defaultCombatAttackDamage: string | null;
  defaultRollHpIndividually: boolean;
  defaultTraitTableId: string | null;
  defaultTraitCount: number | null;
  state: {
    currentRegionId: string | null;
    currentDate: string;
    mode: string;
    currentTime: string;
    currentDungeonRegionId: string | null;
    forecastingMode: boolean;
    encounterPanelStateJson: string | null;
    calendarEncounterStateJson: string | null;
    currentRegion: { id: string; name: string; rerollOnSwitch: boolean; regionType: string } | null;
  } | null;
  regions: { id: string; name: string; rerollOnSwitch: boolean; regionType: string }[];
}

interface AppShellProps {
  campaign: Campaign;
  allCampaigns: { id: string; name: string }[];
  userId: string;
  initialFlags: CampaignFlag[];
}

export default function AppShell({ campaign, allCampaigns, initialFlags }: AppShellProps) {
  const [rulesCollapsed, setRulesCollapsed] = useState(false);
  const [filterRulesByMode, setFilterRulesByMode] = useState(true);
  const [currentRegionId, setCurrentRegionId] = useState<string | null>(
    campaign.state?.currentRegionId ?? null
  );
  const [mode, setMode] = useState<ExplorationMode>(
    (campaign.state?.mode as ExplorationMode) ?? "OVERLAND"
  );
  const [currentDungeonRegionId, setCurrentDungeonRegionId] = useState<string | null>(
    campaign.state?.currentDungeonRegionId ?? null
  );
  const [currentTime, setCurrentTime] = useState<string>(
    campaign.state?.currentTime ?? "12:00 PM"
  );
  const [encounterTableOverrideId, setEncounterTableOverrideId] = useState<string | null>(null);
  const [combatPrefill, setCombatPrefill] = useState<{ name: string; count: number } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Initialize directly from the server-rendered value — same on server and client, so no SSR mismatch
  const initialEncounterPanelState = parseEncounterPanelState(campaign.state?.encounterPanelStateJson);
  const [overlandEncounter, setOverlandEncounter] = useState<EncounterPersistedState>(initialEncounterPanelState.OVERLAND);
  const [dungeonEncounter, setDungeonEncounter] = useState<EncounterPersistedState>(initialEncounterPanelState.DUNGEON);
  const encounterWindows = parseEncounterWindows(campaign.encounterWindowsJson);

  // Persist encounter panel state to the DB (debounced) so it survives reload and follows to other devices
  useEffect(() => {
    const timeout = setTimeout(() => {
      fetch("/api/campaign-state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          encounterPanelStateJson: JSON.stringify({ OVERLAND: overlandEncounter, DUNGEON: dungeonEncounter }),
        }),
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(timeout);
  }, [overlandEncounter, dungeonEncounter, campaign.id]);

  async function handleModeChange(newMode: ExplorationMode) {
    setMode(newMode);
    await fetch("/api/campaign-state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: campaign.id, mode: newMode }),
    });
  }

  async function handleDungeonRegionChange(regionId: string | null) {
    setCurrentDungeonRegionId(regionId);
    await fetch("/api/campaign-state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: campaign.id, currentDungeonRegionId: regionId }),
    });
  }

  async function handleTimeChange(time: string) {
    setCurrentTime(time);
    await fetch("/api/campaign-state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: campaign.id, currentTime: time }),
    });
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <TopBar
        campaign={campaign}
        allCampaigns={allCampaigns}
        mode={mode}
        onModeChange={handleModeChange}
        onRegionChange={setCurrentRegionId}
        currentDungeonRegionId={currentDungeonRegionId}
        onDungeonRegionChange={handleDungeonRegionChange}
        onOpenHistory={() => setHistoryOpen(true)}
      />
      <RollHistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        campaignId={campaign.id}
        currentRegionId={mode === "DUNGEON" ? currentDungeonRegionId : currentRegionId}
      />
      <FlagStrip campaignId={campaign.id} initialFlags={initialFlags} />
      <main className="flex-1 grid grid-cols-1 md:grid-cols-[minmax(280px,360px)_1fr_minmax(280px,360px)] gap-4 p-4 overflow-auto items-start">
        {/* Rules panel */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setRulesCollapsed((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors px-1"
              title={rulesCollapsed ? "Expand rules" : "Collapse rules"}
            >
              <svg
                className={["w-3 h-3 transition-transform text-indigo-400 dark:text-indigo-500", rulesCollapsed ? "-rotate-90" : ""].join(" ")}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              Rules &amp; Reference
            </button>
            <button
              onClick={() => setFilterRulesByMode((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
              title="Filter rules sections to the current mode (OVERLAND/DUNGEON)"
            >
              Filter: {filterRulesByMode ? "On" : "Off"}
            </button>
          </div>
          {!rulesCollapsed && (
            <RulesSectionList
              campaignId={campaign.id}
              mode={mode}
              filterByMode={filterRulesByMode && mode !== "COMBAT"}
            />
          )}
        </section>

        {/* Generators panel — hidden in Combat mode */}
        <section className="flex flex-col gap-6">
          {mode === "COMBAT" ? (
            <CombatPanel
              campaignId={campaign.id}
              campaignDefaults={{
                defaultCombatAC: campaign.defaultCombatAC,
                defaultCombatHD: campaign.defaultCombatHD,
                defaultCombatAttackBonus: campaign.defaultCombatAttackBonus,
                defaultCombatAttackDamage: campaign.defaultCombatAttackDamage,
                defaultRollHpIndividually: campaign.defaultRollHpIndividually,
                defaultTraitTableId: campaign.defaultTraitTableId,
                defaultTraitCount: campaign.defaultTraitCount,
              }}
              regions={campaign.regions}
              currentRegionId={currentRegionId}
              prefill={combatPrefill}
              onPrefillConsumed={() => setCombatPrefill(null)}
            />
          ) : (
            <>
              <NpcPanel
                campaignId={campaign.id}
                currentRegionId={currentRegionId}
                regions={campaign.regions}
              />
              <TablesPanel
                key={mode}
                campaignId={campaign.id}
                category="ENCOUNTER"
                currentRegionId={mode === "DUNGEON" ? currentDungeonRegionId : currentRegionId}
                regions={campaign.regions}
                title="Random Encounter Generator"
                defaultSurpriseDice={campaign.defaultSurpriseDice}
                defaultSurpriseThreshold={campaign.defaultSurpriseThreshold}
                encounterWindows={encounterWindows}
                encounterTableOverrideId={encounterTableOverrideId}
                mode={mode}
                onSendToCombat={(name, count) => {
                  setCombatPrefill({ name, count });
                  handleModeChange("COMBAT");
                }}
                initialLastResult={
                  mode === "DUNGEON"
                    ? (isCompatibleWithMode(dungeonEncounter.tableApplicableModes, "DUNGEON") ? dungeonEncounter.lastResult : null)
                    : (isCompatibleWithMode(overlandEncounter.tableApplicableModes, "OVERLAND") ? overlandEncounter.lastResult : null)
                }
                initialLastEncounterTime={
                  mode === "DUNGEON"
                    ? (isCompatibleWithMode(dungeonEncounter.tableApplicableModes, "DUNGEON") ? dungeonEncounter.lastEncounterTime : null)
                    : (isCompatibleWithMode(overlandEncounter.tableApplicableModes, "OVERLAND") ? overlandEncounter.lastEncounterTime : null)
                }
                onEncounterResultChange={(result, encounterTime, tableApplicableModes) => {
                  const state = { lastResult: result, lastEncounterTime: encounterTime, tableApplicableModes: tableApplicableModes ?? null };
                  if (mode === "DUNGEON") setDungeonEncounter(state);
                  else setOverlandEncounter(state);
                }}
              />
              <TablesPanel
                campaignId={campaign.id}
                category="GENERAL"
                currentRegionId={currentRegionId}
                regions={campaign.regions}
                title="Random Tables"
              />
            </>
          )}
        </section>

        {/* Calendar + Dungeon panel — hidden in Combat mode */}
        <section className="flex flex-col gap-3">
          {mode !== "COMBAT" && (
            <>
              {mode === "DUNGEON" && (
                <DungeonPanel
                  campaignId={campaign.id}
                  currentTime={currentTime}
                  currentDungeonRegionId={currentDungeonRegionId}
                  onTimeChange={handleTimeChange}
                  encounterTableOverrideId={encounterTableOverrideId}
                  onSendToCombat={(name, count) => {
                    setCombatPrefill({ name, count });
                    handleModeChange("COMBAT");
                  }}
                />
              )}
              <CalendarPanel
                campaignId={campaign.id}
                currentDate={campaign.state?.currentDate ?? "0001-01-01"}
                currentRegionId={currentRegionId}
                regions={campaign.regions}
                encounterTableOverrideId={encounterTableOverrideId}
                onEncounterTableOverrideChange={setEncounterTableOverrideId}
                initialCollapsed={mode === "DUNGEON"}
                initialForecastingMode={campaign.state?.forecastingMode ?? false}
                initialCalendarEncounterState={campaign.state?.calendarEncounterStateJson ?? null}
                onSendToCombat={(name, count) => {
                  setCombatPrefill({ name, count });
                  handleModeChange("COMBAT");
                }}
              />
            </>
          )}
        </section>
      </main>
    </div>
  );
}
