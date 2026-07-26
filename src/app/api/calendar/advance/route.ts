import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { parseDate, formatDate, advanceDate, getCurrentSeason } from "@/lib/calendar/engine";
import { rollOnTable } from "@/lib/tables/engine";
import { shapeTable, tableInclude, type RawTable } from "@/lib/tables/shape-table";
import { rollEncounterFull, rollEncounterForWindows } from "@/lib/tables/encounter-roll";
import { parseEncounterWindows } from "@/lib/encounter-timing";
import { buildDoc, appendToDoc, buildDaySummaryNodes } from "@/lib/calendar/note-builder";
import { seasonFilterPasses } from "@/lib/tables/season-filter";
import { serializeTodayWeather } from "@/lib/calendar/today-weather";
import type { RandomTable } from "@/types/table";
import type { EncounterSummary } from "@/lib/tables/encounter-roll";

const advanceSchema = z.object({
  campaignId: z.string(),
  currentRegionId: z.string().nullable().optional(),
  userToggles: z.array(z.string()).default([]),
  encounterTableOverrideId: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = advanceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { campaignId, currentRegionId = null, userToggles, encounterTableOverrideId = null } = parsed.data;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      state: true,
      calendarConfig: { include: { moons: true } },
    },
  });

  if (!campaign || campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!campaign.calendarConfig) {
    return NextResponse.json({ error: "No calendar configured" }, { status: 400 });
  }

  const config = campaign.calendarConfig;
  const currentDateStr = campaign.state?.currentDate ?? "0001-01-01";
  const currentDate = parseDate(currentDateStr);
  const forecastingMode = campaign.state?.forecastingMode ?? false;

  const calConfig = {
    id: config.id,
    campaignId,
    epochDate: config.epochDate,
    months: JSON.parse(config.monthsJson),
    weekdays: JSON.parse(config.weekdaysJson),
    seasons: JSON.parse(config.seasonsJson),
    intercalary: config.intercalaryJson ? JSON.parse(config.intercalaryJson) : [],
    moons: config.moons,
  };

  const newDate = advanceDate(currentDate, calConfig);
  const newDateStr = formatDate(newDate);

  // Determine the active season name on the new date (used for season filtering)
  const activeSeason = getCurrentSeason(newDate, calConfig);
  const activeSeasonName = activeSeason?.name ?? null;

  // In forecasting mode, also compute tomorrow's date and season
  const tomorrowDate = forecastingMode ? advanceDate(newDate, calConfig) : null;
  const tomorrowDateStr = tomorrowDate ? formatDate(tomorrowDate) : null;
  const tomorrowSeason = tomorrowDate ? getCurrentSeason(tomorrowDate, calConfig) : null;
  const tomorrowSeasonName = tomorrowSeason?.name ?? null;

  // Helper: does this table pass the region + season filter for a given date/season?
  function tablePassesFilter(raw: RawTable, seasonName: string | null): boolean {
    const regionIds = raw.regions.map((r) => r.regionId);
    if (regionIds.length > 0 && (!currentRegionId || !regionIds.includes(currentRegionId))) return false;
    return seasonFilterPasses(raw, seasonName);
  }

  // Canonical key for a table's region set: sorted IDs joined, or "" for "all regions".
  function regionSetKey(raw: RawTable): string {
    const ids: string[] = raw.regions.map((r) => r.regionId);
    return ids.slice().sort().join(",");
  }

  interface TodayResult { rawDice: number; diceTotal: number; outcome: string }

  const payload = await prisma.$transaction(async (tx) => {
    // ── Weather (CALENDAR tables) ───────────────────────────────────────────────

    const calendarTables = await tx.randomTable.findMany({
      where: { campaignId, category: "CALENDAR", rollOnDayAdvance: true },
      include: tableInclude,
    });

    const weatherRolls: { tableId: string; tableName: string; outcome: string; roll: number }[] = [];
    const forecastRolls: { tableId: string; tableName: string; outcome: string; roll: number }[] = [];

    // ── Pass 1: today's results ─────────────────────────────────────────────────
    // Keyed by tableId and by name so tomorrow's pass can find relevant prev results.

    const todayById        = new Map<string, TodayResult>();
    const todayByRegionSet = new Map<string, TodayResult>(); // season-boundary chain fallback

    for (const raw of calendarTables) {
      if (!tablePassesFilter(raw, activeSeasonName)) continue;

      const table = shapeTable(raw);

      let rawDice: number, diceTotal: number, outcome: string;

      if (forecastingMode && raw.forecastDate === newDateStr && raw.forecastOutcome != null) {
        // Consume pre-rolled forecast
        rawDice  = raw.forecastResult ?? 0;
        diceTotal = raw.forecastModifiedResult ?? 0;
        outcome  = raw.forecastOutcome;
      } else {
        const result = rollOnTable(table, currentRegionId ?? null, userToggles);
        rawDice  = result.rawDiceTotal;
        diceTotal = result.diceTotal;
        outcome  = result.resolvedOutcome.expandedText;
      }

      weatherRolls.push({ tableId: raw.id, tableName: raw.name, outcome, roll: diceTotal });
      todayById.set(raw.id, { rawDice, diceTotal, outcome });
      todayByRegionSet.set(regionSetKey(raw), { rawDice, diceTotal, outcome });

      // Non-forecasting: persist lastResult as usual
      if (!forecastingMode) {
        const needsPersist = raw.isStateful || raw.modifiers.some((m) => m.behavior === "PREV_RESULT_CONDITION");
        if (needsPersist) {
          await tx.randomTable.update({
            where: { id: raw.id },
            data: { lastResult: rawDice, lastModifiedResult: diceTotal },
          });
        }
      }
    }

    // Always write todayWeatherJson, date-stamped to newDateStr — even when
    // weatherRolls is empty. An empty-but-current entry is an honest "nothing
    // qualified today" and lets readers (see forecast route) distinguish it
    // from a stale value left over from a previous day.
    const todayWeatherJson = serializeTodayWeather(newDateStr, weatherRolls);

    // Update CampaignState: date always moves; weather is folded in alongside it.
    await tx.campaignState.upsert({
      where: { campaignId },
      create: { campaignId, currentDate: newDateStr, todayWeatherJson },
      update: { currentDate: newDateStr, todayWeatherJson },
    });

    // ── Pass 2: tomorrow's forecast (forecasting mode only) ─────────────────────
    // Loops over tables valid for TOMORROW independently, so season-boundary tables
    // (e.g. a Spring table on the last day of Winter) are included even if they
    // didn't roll today.

    if (forecastingMode && tomorrowDateStr) {
      for (const raw of calendarTables) {
        if (!tablePassesFilter(raw, tomorrowSeasonName)) {
          // This table doesn't apply to tomorrow. Clear any stale forecast it may hold,
          // and if it rolled today, persist its lastResult.
          const todayResult = todayById.get(raw.id);
          if (todayResult) {
            await tx.randomTable.update({
              where: { id: raw.id },
              data: {
                lastResult: todayResult.rawDice,
                lastModifiedResult: todayResult.diceTotal,
                forecastResult: null,
                forecastModifiedResult: null,
                forecastDate: null,
                forecastOutcome: null,
              },
            });
          }
          continue;
        }

        // Determine the best "previous result" to feed into PREV_RESULT_CONDITION:
        //   1. Same table rolled today (same tableId) — direct chain (same table, continuous season)
        //   2. A today-table with the same region set — season-boundary chain
        //      (e.g. "Western Frankia (Winter)" → "Western Frankia (Spring)", both pinned to Western Frankia)
        //   3. Fall back to the table's own stored lastModifiedResult
        const prevToday = todayById.get(raw.id) ?? todayByRegionSet.get(regionSetKey(raw)) ?? null;
        const prevDiceTotal = prevToday?.diceTotal ?? raw.lastModifiedResult ?? null;

        const table = shapeTable(raw);
        const tableForTomorrow: RandomTable = { ...table, lastModifiedResult: prevDiceTotal };
        const tomorrowResult = rollOnTable(tableForTomorrow, currentRegionId ?? null, userToggles);

        forecastRolls.push({
          tableId: raw.id,
          tableName: raw.name,
          outcome: tomorrowResult.resolvedOutcome.expandedText,
          roll: tomorrowResult.diceTotal,
        });

        const todayResult = todayById.get(raw.id);
        await tx.randomTable.update({
          where: { id: raw.id },
          data: {
            // Persist today's result for tables that rolled today; leave unchanged for others
            ...(todayResult ? { lastResult: todayResult.rawDice, lastModifiedResult: todayResult.diceTotal } : {}),
            forecastResult: tomorrowResult.rawDiceTotal,
            forecastModifiedResult: tomorrowResult.diceTotal,
            forecastDate: tomorrowDateStr,
            forecastOutcome: tomorrowResult.resolvedOutcome.expandedText,
          },
        });
      }
    }

    // ── Encounters ─────────────────────────────────────────────────────────────
    // Only roll if there is an ENCOUNTER table scoped to the current region.

    let dayEncounter: EncounterSummary | null = null;
    let nightEncounter: EncounterSummary | null = null;
    // One entry per configured encounter window (superset of day/night above).
    let encounters: EncounterSummary[] = [];

    if (encounterTableOverrideId || currentRegionId) {
      const encounterRaw = encounterTableOverrideId
        ? await tx.randomTable.findUnique({ where: { id: encounterTableOverrideId }, include: tableInclude })
        : await tx.randomTable.findFirst({
            where: { campaignId, category: "ENCOUNTER", regions: { some: { regionId: currentRegionId! } } },
            include: tableInclude,
          });

      if (encounterRaw) {
        const encounterTable = shapeTable(encounterRaw);

        // Reaction table: campaign default → first REACTION table
        const reactionRaw = campaign.defaultReactionTableId
          ? await tx.randomTable.findUnique({ where: { id: campaign.defaultReactionTableId }, include: tableInclude })
          : await tx.randomTable.findFirst({ where: { campaignId, category: "REACTION" }, include: tableInclude });
        const reactionTable = reactionRaw ? shapeTable(reactionRaw) : null;

        const windows = parseEncounterWindows(campaign.encounterWindowsJson);

        const rollParams = {
          table: encounterTable,
          reactionTable,
          regionId: currentRegionId,
          campaignDefaultSurpriseDice: campaign.defaultSurpriseDice,
          campaignDefaultSurpriseThreshold: campaign.defaultSurpriseThreshold,
        };

        // One roll per configured window. `day`/`night` are kept populated from
        // window 0 / window 1 for back-compat with existing readers.
        encounters = rollEncounterForWindows(windows, rollParams);
        dayEncounter = encounters[0] ?? null;
        nightEncounter = encounters[1] ?? null;
      }
    }

    // ── Calendar note ───────────────────────────────────────────────────────────

    const noteNodes = buildDaySummaryNodes({ weatherRolls, dayEncounter, nightEncounter });

    if (noteNodes.length > 0) {
      const existing = await tx.calendarNote.findFirst({ where: { campaignId, date: newDateStr } });
      if (existing) {
        await tx.calendarNote.update({
          where: { id: existing.id },
          data: { content: appendToDoc(existing.content, noteNodes) },
        });
      } else {
        await tx.calendarNote.create({
          data: { campaignId, date: newDateStr, content: buildDoc(noteNodes) },
        });
      }
    }

    // ── Flag counters ───────────────────────────────────────────────────────────

    const flags = await tx.campaignFlag.findMany({
      where: { campaignId, paused: false, counter: { not: null }, countDirection: { not: null } },
    });
    for (const flag of flags) {
      const newCounter =
        flag.countDirection === "up"
          ? (flag.counter ?? 0) + 1
          : Math.max(0, (flag.counter ?? 0) - 1);
      await tx.campaignFlag.update({ where: { id: flag.id }, data: { counter: newCounter } });
    }

    return {
      newDate: newDateStr,
      dailyRolls: weatherRolls,
      forecastRolls,
      dayEncounter,
      nightEncounter,
      encounters,
    };
  }, { timeout: 30000 });

  return NextResponse.json(payload);
}
