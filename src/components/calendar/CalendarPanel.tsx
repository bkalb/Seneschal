"use client";

import { useState, useEffect, useRef } from "react";
import type { CalendarNote } from "@/types/calendar";
import {
  useCalendarConfig,
  useCalendarNotes,
  useCreateCalendarNote,
  useUpdateCalendarNote,
  useDeleteCalendarNote,
  useAdvanceDay,
  useSetCurrentDate,
  useRerollForRegion,
  useToggleForecastingMode,
  useGetForecastRolls,
  type DailyRollResult,
  type EncounterSummary,
  type AdvanceDayResult,
} from "@/hooks/useCalendar";
import { useRandomTables, useUpdateTable } from "@/hooks/useRandomTables";
import { CalendarConfigEditor } from "./CalendarConfigEditor";
import { TableImportWizard } from "@/components/tables/TableImportWizard";
import { TableManagerModal } from "@/components/tables/TableManagerModal";
import { MoonPhaseIcon } from "./MoonPhaseIcon";
import RichTextEditor from "@/components/ui/RichTextEditor";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  parseDate,
  formatDate,
  computeWeekday,
  getCurrentSeason,
  firstWeekdayOfMonth,
} from "@/lib/calendar/engine";
import { computeAllMoonPhases } from "@/lib/calendar/moon";
import { extractCombatantInfo } from "@/lib/combat-prefill";

// Parse the DB-backed calendar encounter summaries. Date-keyed: a slot is only used
// if the stored date matches the current date, so stale summaries from a previous day are ignored.
function parseCalendarEncounter(json: string | null | undefined, date: string, slot: "day" | "night"): EncounterSummary | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as { date: string; day: EncounterSummary | null; night: EncounterSummary | null };
    if (parsed.date !== date) return null;
    return (slot === "day" ? parsed.day : parsed.night) ?? null;
  } catch {}
  return null;
}

interface Props {
  campaignId: string;
  currentDate: string; // "YYYY-MM-DD"
  currentRegionId: string | null;
  regions: { id: string; name: string }[];
  encounterTableOverrideId: string | null;
  onEncounterTableOverrideChange: (id: string | null) => void;
  initialCollapsed?: boolean;
  initialForecastingMode?: boolean;
  initialCalendarEncounterState?: string | null;
  onSendToCombat?: (name: string, count: number) => void;
}

export function CalendarPanel({ campaignId, currentDate: initialDate, currentRegionId, regions, encounterTableOverrideId, onEncounterTableOverrideChange, initialCollapsed = false, initialForecastingMode = false, initialCalendarEncounterState = null, onSendToCombat }: Props) {
  const [calendarCollapsed, setCalendarCollapsed] = useState(initialCollapsed);
  const { data: config, isLoading: configLoading } = useCalendarConfig(campaignId);
  const { data: notes = [] } = useCalendarNotes(campaignId);

  // Local copy of the current date — updated immediately on mutation success
  // (the campaign prop is server-rendered and won't re-stream on client mutations)
  const [currentDate, setCurrentDate] = useState(initialDate);

  const [showConfig, setShowConfig] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showTableManager, setShowTableManager] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dailyRolls, setDailyRolls] = useState<DailyRollResult[] | null>(null);
  const [forecastRolls, setForecastRolls] = useState<DailyRollResult[] | null>(null);
  const [dayEncounter, setDayEncounter] = useState<EncounterSummary | null>(() => parseCalendarEncounter(initialCalendarEncounterState, initialDate, "day"));
  const [nightEncounter, setNightEncounter] = useState<EncounterSummary | null>(() => parseCalendarEncounter(initialCalendarEncounterState, initialDate, "night"));
  const [forecastingMode, setForecastingMode] = useState(initialForecastingMode);

  // Inline date-jump state
  const [editingDate, setEditingDate] = useState(false);
  const [dateInput, setDateInput] = useState("");

  const parsedCurrent = parseDate(currentDate);
  const [viewYear, setViewYear] = useState(parsedCurrent.year);
  const [viewMonth, setViewMonth] = useState(parsedCurrent.month);

  const advanceMutation = useAdvanceDay(campaignId);
  const setDateMutation = useSetCurrentDate(campaignId);
  const rerollMutation = useRerollForRegion(campaignId);
  const forecastingModeMutation = useToggleForecastingMode(campaignId);
  const getForecastMutation = useGetForecastRolls(campaignId);

  // On mount, if forecasting mode is enabled, load stored today + tomorrow rolls
  const isMountForecastFetched = useRef(false);
  useEffect(() => {
    if (isMountForecastFetched.current) return;
    isMountForecastFetched.current = true;
    if (!initialForecastingMode || !currentRegionId) return;
    getForecastMutation.mutateAsync({ currentRegionId, currentDate, encounterTableOverrideId })
      .then(({ todayRolls, forecastRolls, dayEncounter: newDay, nightEncounter: newNight }) => {
        if (todayRolls.length > 0) setDailyRolls(todayRolls);
        if (forecastRolls.length > 0) setForecastRolls(forecastRolls);
        // Don't overwrite encounters already restored from the DB
        if (newDay) setDayEncounter(prev => prev ?? newDay);
        if (newNight) setNightEncounter(prev => prev ?? newNight);
      })
      .catch(() => {});
  }, []);

  // When the active region changes, map weather + re-roll encounters for today
  const prevRegionId = useRef(currentRegionId);
  useEffect(() => {
    const prev = prevRegionId.current;
    prevRegionId.current = currentRegionId;
    if (currentRegionId === prev) return; // skip on mount and Strict Mode double-fire
    if (!currentRegionId) {
      setDailyRolls(null);
      setForecastRolls(null);
      setDayEncounter(null);
      setNightEncounter(null);
      return;
    }
    const region = regions.find((r) => r.id === currentRegionId);
    if (!region) return;
    setDailyRolls(null);
    setForecastRolls(null);
    setDayEncounter(null);
    setNightEncounter(null);
    rerollMutation.mutateAsync({ regionId: currentRegionId, regionName: region.name, currentDate, encounterTableOverrideId })
      .then((result) => {
        if (result.weatherRolls.length > 0) setDailyRolls(result.weatherRolls);
        if (result.dayEncounter) setDayEncounter(result.dayEncounter);
        if (result.nightEncounter) setNightEncounter(result.nightEncounter);
      })
      .catch(() => {});
  }, [currentRegionId]);

  // Must be called unconditionally — moved above early returns
  const { data: calendarTables = [] } = useRandomTables(campaignId, "CALENDAR");
  const { data: encounterTables = [] } = useRandomTables(campaignId, "ENCOUNTER");

  // On initial load, restore stateful CALENDAR table results from the DB-backed lastResult field.
  // Only runs when tables first arrive; skipped if a live roll has already set dailyRolls.
  useEffect(() => {
    if (calendarTables.length === 0 || forecastingMode || dailyRolls !== null) return;
    const restored: DailyRollResult[] = calendarTables
      .filter((t) => t.isStateful && t.rollOnDayAdvance && t.lastResult !== null)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .flatMap((t) => {
        const value = t.lastModifiedResult ?? t.lastResult!;
        const row = t.rows.find((r) => value >= r.min && value <= r.max);
        if (!row) return [];
        return [{ tableId: t.id, tableName: t.name, outcome: row.outcome, roll: value }];
      });
    if (restored.length > 0) setDailyRolls(restored);
  }, [calendarTables.length]);

  // Persist encounter summaries to the DB (debounced) so they survive page refreshes and follow to other devices.
  // Keyed by date so stale encounters from previous days are naturally ignored on restore.
  useEffect(() => {
    const timeout = setTimeout(() => {
      fetch("/api/campaign-state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          calendarEncounterStateJson: JSON.stringify({ date: currentDate, day: dayEncounter, night: nightEncounter }),
        }),
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(timeout);
  }, [dayEncounter, nightEncounter, currentDate, campaignId]);

  const updateTableMutation = useUpdateTable(campaignId);

  async function handleAdvanceDay() {
    setDailyRolls(null);
    setForecastRolls(null);
    setDayEncounter(null);
    setNightEncounter(null);
    const result = await advanceMutation.mutateAsync({ currentRegionId, encounterTableOverrideId });
    const d = parseDate(result.newDate);
    setCurrentDate(result.newDate);
    setViewYear(d.year);
    setViewMonth(d.month);
    if (result.dailyRolls.length > 0) setDailyRolls(result.dailyRolls);
    if (result.forecastRolls?.length > 0) setForecastRolls(result.forecastRolls);
    if (result.dayEncounter) setDayEncounter(result.dayEncounter);
    if (result.nightEncounter) setNightEncounter(result.nightEncounter);
  }

  async function handleToggleForecastingMode() {
    const next = !forecastingMode;
    setForecastingMode(next);
    await forecastingModeMutation.mutateAsync(next);
  }

  function openDateEditor() {
    setDateInput(currentDate);
    setEditingDate(true);
  }

  async function confirmSetDate() {
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      await setDateMutation.mutateAsync(trimmed);
      const d = parseDate(trimmed);
      setCurrentDate(trimmed);
      setViewYear(d.year);
      setViewMonth(d.month);
    }
    setEditingDate(false);
  }

  function prevMonth() {
    if (viewMonth === 1) { setViewMonth(config?.months.length ?? 12); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    const numMonths = config?.months.length ?? 12;
    if (viewMonth === numMonths) { setViewMonth(1); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }
  function goToToday() {
    const d = parseDate(currentDate);
    setViewYear(d.year); setViewMonth(d.month);
  }

  if (configLoading) {
    return (
      <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground animate-pulse">
        Loading calendar…
      </div>
    );
  }

  if (!config) {
    return (
      <div className="rounded-lg border border-border p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Calendar</span>
          <button
            onClick={() => setShowConfig(true)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Configure calendar
          </button>
        </div>
        <p className="text-xs text-muted-foreground">No calendar configured. Click the gear icon to set one up.</p>
        {showConfig && (
          <CalendarConfigEditor
            campaignId={campaignId}
            existing={null}
            onClose={() => setShowConfig(false)}
          />
        )}
      </div>
    );
  }

  const currentParsed = parseDate(currentDate);
  const weekday = computeWeekday(currentParsed, config);
  const season = getCurrentSeason(currentParsed, config);
  const moonPhases = computeAllMoonPhases(currentParsed, config);
  const monthName = config.months[viewMonth - 1]?.name ?? `Month ${viewMonth}`;
  const daysInMonth = config.months[viewMonth - 1]?.days ?? 30;
  const firstWeekday = firstWeekdayOfMonth(viewYear, viewMonth, config);
  const numWeekdays = config.weekdays.length || 7;

  const noteDateSet = new Set(notes.map((n) => n.date));
  const isCurrentMonth = viewYear === currentParsed.year && viewMonth === currentParsed.month;

  // All tables that auto-roll on day advance
  const dailyTables = calendarTables.filter((t) => t.rollOnDayAdvance);

  // Filtered to only those active for the current region + season
  const activeDailyTables = dailyTables.filter((t) => {
    // Region: empty regionIds means "all regions"
    const regionMatch =
      t.regionIds.length === 0 ||
      (currentRegionId != null && t.regionIds.includes(currentRegionId));
    if (!regionMatch) return false;

    // Season: null seasonName means "all seasons"
    if (!t.seasonName) {
      // If no season restriction, still respect rollWhenNoSeason when there's no active season
      return season != null || t.rollWhenNoSeason === "always";
    }
    const tableSeasons = t.seasonName.split(",").map((s) => s.trim());
    if (season != null) return tableSeasons.includes(season.name);
    return t.rollWhenNoSeason === "always";
  });

  return (
    <div className="rounded-lg border border-border border-t-2 border-t-emerald-400 dark:border-t-emerald-500 flex flex-col gap-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <button
          onClick={() => setCalendarCollapsed((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          title={calendarCollapsed ? "Expand calendar" : "Collapse calendar"}
        >
          <svg
            className={["w-3 h-3 transition-transform text-emerald-400 dark:text-emerald-500", calendarCollapsed ? "-rotate-90" : ""].join(" ")}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          Calendar &amp; Daily Tables
        </button>
        {!calendarCollapsed && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              title="Import table"
              className="text-muted-foreground hover:text-foreground"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </button>
            {calendarTables.length > 0 && (
              <button
                onClick={() => setShowTableManager(true)}
                title="Manage tables"
                className="text-muted-foreground hover:text-foreground"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
            )}
            <button
              onClick={() => setShowConfig(true)}
              title="Configure calendar"
              className="text-muted-foreground hover:text-foreground"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Collapsible body */}
      {!calendarCollapsed && (<>

      {/* Current date display */}
      <div className="px-3 py-2 border-b border-border space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            {editingDate ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  type="text"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmSetDate();
                    if (e.key === "Escape") setEditingDate(false);
                  }}
                  placeholder="YYYY-MM-DD"
                  className="w-32 rounded border border-border bg-background px-2 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={confirmSetDate}
                  disabled={setDateMutation.isPending}
                  className="text-xs px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {setDateMutation.isPending ? "…" : "Set"}
                </button>
                <button
                  onClick={() => setEditingDate(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold">
                  {weekday && <span className="text-muted-foreground font-normal">{weekday}, </span>}
                  {config.months[currentParsed.month - 1]?.name ?? `Month ${currentParsed.month}`}{" "}
                  {currentParsed.day}, Year {currentParsed.year}
                </p>
                <button
                  onClick={openDateEditor}
                  title="Jump to date"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </div>
            )}
            {!editingDate && season && (
              <p className="text-xs text-muted-foreground">{season.name}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {moonPhases.map((mp) => (
              <div key={mp.moon.id} className="flex flex-col items-center gap-0.5" title={`${mp.moon.name}: ${mp.phase.replace(/_/g, " ")}`}>
                <MoonPhaseIcon phase={mp.phase} size={16} />
                {moonPhases.length > 1 && (
                  <span className="text-[9px] text-muted-foreground leading-none" style={{ maxWidth: 40, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {mp.moon.name}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
        {/* Manual modifiers — only for the active region + season table */}
        {activeDailyTables.length > 0 && (
          <div className="space-y-1 pt-0.5">
            {activeDailyTables.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground flex-1 truncate">{t.name}</span>
                <span className="text-xs text-muted-foreground">modifier</span>
                <input
                  type="number"
                  value={t.manualModifier}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    updateTableMutation.mutate({ id: t.id, manualModifier: val });
                  }}
                  className="w-16 rounded border border-border bg-background px-2 py-0.5 text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            ))}
          </div>
        )}
        {/* Encounter table override */}
        {encounterTables.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">Encounter table:</span>
            <select
              value={encounterTableOverrideId ?? ""}
              onChange={(e) => onEncounterTableOverrideChange(e.target.value || null)}
              className="flex-1 min-w-0 rounded border border-border bg-background px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Region default</option>
              {encounterTables.slice().sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={handleAdvanceDay}
            disabled={advanceMutation.isPending}
            className="flex-1 py-1 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {advanceMutation.isPending ? "Advancing…" : "Advance Day"}
          </button>
          <button
            onClick={handleToggleForecastingMode}
            disabled={forecastingModeMutation.isPending}
            title={forecastingMode ? "Forecasting mode on — click to disable" : "Enable forecasting mode (rolls weather one day ahead)"}
            className={[
              "px-2 py-1 rounded text-xs border transition-colors shrink-0",
              forecastingMode
                ? "bg-primary/15 border-primary text-primary"
                : "border-border text-muted-foreground hover:border-primary hover:text-primary",
            ].join(" ")}
          >
            Forecast
          </button>
        </div>
      </div>

      {/* Daily summary results */}
      {(dailyRolls?.length || forecastRolls?.length || dayEncounter || nightEncounter) ? (
        <div className="px-3 py-2 border-b border-border bg-muted/50 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Day Summary</span>
            <button
              onClick={() => { setDailyRolls(null); setForecastRolls(null); setDayEncounter(null); setNightEncounter(null); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {dailyRolls && dailyRolls.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                {forecastRolls && forecastRolls.length > 0 ? "Today — Weather" : "Weather"}
              </p>
              {dailyRolls.map((r) => (
                <div key={r.tableId} className="text-xs">
                  <span className="text-muted-foreground">{r.tableName}:</span>{" "}
                  <span className={r.roll >= 7 ? "text-red-600" : undefined}>{r.outcome}</span>
                </div>
              ))}
            </div>
          )}
          {forecastRolls && forecastRolls.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Tomorrow — Weather</p>
              {forecastRolls.map((r) => (
                <div key={r.tableId} className="text-xs">
                  <span className="text-muted-foreground">{r.tableName}:</span>{" "}
                  <span className={r.roll >= 7 ? "text-red-600" : undefined}>{r.outcome}</span>
                </div>
              ))}
            </div>
          )}
          {[dayEncounter, nightEncounter].map((enc) => enc && (
            <EncounterSummaryCard key={enc.label} enc={enc} onSendToCombat={onSendToCombat} />
          ))}
        </div>
      ) : null}

      {/* Month navigation */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <button onClick={prevMonth} className="text-muted-foreground hover:text-foreground p-0.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{monthName} — Year {viewYear}</span>
          {!isCurrentMonth && (
            <button onClick={goToToday} className="text-[10px] text-primary hover:underline">today</button>
          )}
        </div>
        <button onClick={nextMonth} className="text-muted-foreground hover:text-foreground p-0.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Calendar grid */}
      <div className="p-2">
        {config.weekdays.length > 0 && (
          <div
            className="grid mb-1"
            style={{ gridTemplateColumns: `repeat(${numWeekdays}, minmax(0, 1fr))` }}
          >
            {config.weekdays.map((wd) => (
              <div key={wd} className="text-center text-[10px] text-muted-foreground font-medium py-0.5 truncate px-0.5">
                {wd.slice(0, 2)}
              </div>
            ))}
          </div>
        )}

        <div
          className="grid gap-0.5"
          style={{ gridTemplateColumns: `repeat(${numWeekdays}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: firstWeekday }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = formatDate({ year: viewYear, month: viewMonth, day });
            const isToday =
              viewYear === currentParsed.year &&
              viewMonth === currentParsed.month &&
              day === currentParsed.day;
            const hasNote = noteDateSet.has(dateStr);
            const dayMoonPhases = computeAllMoonPhases({ year: viewYear, month: viewMonth, day }, config);

            return (
              <button
                key={day}
                onClick={() => setSelectedDate(dateStr)}
                className={[
                  "relative flex flex-col items-center rounded py-0.5 text-[11px] transition-colors hover:bg-muted min-h-[32px] gap-0.5",
                  isToday ? "bg-primary/15 text-primary font-semibold ring-1 ring-primary/40" : "text-foreground",
                ].join(" ")}
              >
                <span>{day}</span>
                {dayMoonPhases.length > 0 && (
                  <div className="flex gap-px">
                    {dayMoonPhases.map((mp) => (
                      <MoonPhaseIcon key={mp.moon.id} phase={mp.phase} size={10} />
                    ))}
                  </div>
                )}
                {hasNote && (
                  <span className="absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-primary/60" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      </>)} {/* end collapsible body */}

      {selectedDate && (
        <DayDetailSheet
          campaignId={campaignId}
          date={selectedDate}
          currentDate={currentDate}
          config={config}
          notes={notes.filter((n) => n.date === selectedDate)}
          onClose={() => setSelectedDate(null)}
          onDateChange={(d) => {
            setCurrentDate(d);
            const parsed = parseDate(d);
            setViewYear(parsed.year);
            setViewMonth(parsed.month);
            setSelectedDate(null);
          }}
        />
      )}

      {showConfig && (
        <CalendarConfigEditor
          campaignId={campaignId}
          existing={config}
          onClose={() => setShowConfig(false)}
        />
      )}

      {showImport && (
        <TableImportWizard
          campaignId={campaignId}
          category="CALENDAR"
          regions={regions}
          seasons={config?.seasons.map((s) => s.name) ?? []}
          onClose={() => setShowImport(false)}
        />
      )}

      {showTableManager && (
        <TableManagerModal
          title="Calendar Tables"
          tables={calendarTables}
          campaignId={campaignId}
          regions={regions}
          seasons={config?.seasons.map((s) => s.name) ?? []}
          onClose={() => setShowTableManager(false)}
        />
      )}
    </div>
  );
}

// ─── Encounter Summary Card ───────────────────────────────────────────────────

function EncounterSummaryCard({ enc, onSendToCombat }: { enc: EncounterSummary; onSendToCombat?: (name: string, count: number) => void }) {
  const header = enc.time ? `${enc.label} — ${enc.time}` : enc.label;
  const combatInfo = onSendToCombat ? extractCombatantInfo(enc.outcome) : null;
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{header}</p>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs">{enc.outcome}</p>
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
      {enc.reaction && (
        <p className="text-xs text-muted-foreground">
          Reaction: {enc.reaction.outcome} ({enc.reaction.tableName}, rolled {enc.reaction.roll})
        </p>
      )}
      {enc.surprise && (
        <p className={["text-xs", enc.surprise.surprised ? "text-amber-700" : "text-muted-foreground"].join(" ")}>
          {enc.surprise.surprised
            ? `Surprised! (rolled ${enc.surprise.roll} on ${enc.surprise.dice}, threshold \u2264${enc.surprise.threshold})`
            : `Not surprised (${enc.surprise.dice}: rolled ${enc.surprise.roll})`}
        </p>
      )}
    </div>
  );
}

// ─── Day Detail Sheet ─────────────────────────────────────────────────────────

interface DayDetailProps {
  campaignId: string;
  date: string;
  currentDate: string;
  config: import("@/types/calendar").CalendarConfig;
  notes: CalendarNote[];
  onClose: () => void;
  onDateChange: (date: string) => void;
}

function DayDetailSheet({ campaignId, date, currentDate, config, notes, onClose, onDateChange }: DayDetailProps) {
  const parsed = parseDate(date);
  const weekday = computeWeekday(parsed, config);
  const monthName = config.months[parsed.month - 1]?.name ?? `Month ${parsed.month}`;
  const existing = notes[0] ?? null;
  const isToday = date === currentDate;

  const [content, setContent] = useState(existing?.content ?? "");
  const [dirty, setDirty] = useState(false);

  const createMutation = useCreateCalendarNote(campaignId);
  const updateMutation = useUpdateCalendarNote(campaignId);
  const deleteMutation = useDeleteCalendarNote(campaignId);
  const setDateMutation = useSetCurrentDate(campaignId);

  const [confirmReset, setConfirmReset] = useState(false);

  async function handleSave() {
    if (existing) {
      await updateMutation.mutateAsync({ id: existing.id, content });
    } else {
      await createMutation.mutateAsync({ date, content });
    }
    setDirty(false);
    onClose();
  }

  async function handleSetToday() {
    await setDateMutation.mutateAsync(date);
    onDateChange(date);
  }

  const isSavePending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg sm:max-w-lg max-h-[85vh] flex flex-col gap-0 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <p className="font-semibold text-sm">
              {weekday && <span className="text-muted-foreground font-normal">{weekday}, </span>}
              {monthName} {parsed.day}, Year {parsed.year}
            </p>
            {!isToday && (
              <button
                onClick={handleSetToday}
                disabled={setDateMutation.isPending}
                className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 disabled:opacity-50 shrink-0"
              >
                {setDateMutation.isPending ? "Setting…" : "Set as today"}
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <RichTextEditor
            content={content}
            onChange={(json) => { setContent(json); setDirty(true); }}
            editable
          />
        </div>
        <div className="flex justify-between items-center px-4 py-3 border-t border-border shrink-0 gap-2">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            {existing && !confirmReset && (
              <button
                onClick={() => setConfirmReset(true)}
                className="px-3 py-1.5 text-sm text-destructive hover:text-destructive/80"
              >
                Reset day
              </button>
            )}
            {existing && confirmReset && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Delete this day's note?</span>
                <button
                  onClick={async () => {
                    await deleteMutation.mutateAsync({ id: existing.id, date });
                    onClose();
                  }}
                  disabled={deleteMutation.isPending}
                  className="text-xs px-2 py-0.5 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  No
                </button>
              </div>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={isSavePending || !dirty}
            className="px-4 py-1.5 rounded text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isSavePending ? "Saving…" : "Save note"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
