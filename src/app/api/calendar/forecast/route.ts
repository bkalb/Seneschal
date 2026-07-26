/**
 * GET /api/calendar/forecast
 *
 * Returns today's and tomorrow's weather rolls for the current region.
 * On page load, retrieves stored data from the last "Advance Day". If no
 * stored data exists (e.g. forecasting was just enabled, or today's weather
 * was never rolled), rolls fresh and persists the results so they can be
 * restored on subsequent reloads.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { parseDate, formatDate, advanceDate, getCurrentSeason } from "@/lib/calendar/engine";
import { rollOnTable } from "@/lib/tables/engine";
import { shapeTable, tableInclude } from "@/lib/tables/shape-table";
import { rollEncounterFull, rollEncounterForWindows, lookupOutcomeByRoll } from "@/lib/tables/encounter-roll";
import { parseEncounterWindows } from "@/lib/encounter-timing";
import { seasonFilterPasses } from "@/lib/tables/season-filter";
import type { RandomTable } from "@/types/table";
import type { EncounterSummary } from "@/lib/tables/encounter-roll";

const schema = z.object({
  campaignId: z.string(),
  currentRegionId: z.string(),
  currentDate: z.string(), // "YYYY-MM-DD"
  encounterTableOverrideId: z.string().nullable().optional(),
});

type RollResult = { tableId: string; tableName: string; outcome: string; roll: number };

export async function GET(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = schema.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { campaignId, currentRegionId, currentDate, encounterTableOverrideId = null } = parsed.data;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { state: true },
  });
  if (!campaign || campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Restore today's weather from CampaignState
  const todayWeatherJson = campaign.state?.todayWeatherJson ?? null;
  const todayRolls: RollResult[] = todayWeatherJson ? JSON.parse(todayWeatherJson) : [];

  // Load calendar config to compute dates and seasons
  const calendarConfig = await prisma.calendarConfig.findUnique({
    where: { campaignId },
    include: { moons: true },
  });
  if (!calendarConfig) {
    return NextResponse.json({ todayRolls, forecastRolls: [] });
  }

  const parsedConfig = {
    id: calendarConfig.id,
    campaignId: calendarConfig.campaignId,
    epochDate: calendarConfig.epochDate,
    months: JSON.parse(calendarConfig.monthsJson),
    weekdays: JSON.parse(calendarConfig.weekdaysJson),
    seasons: JSON.parse(calendarConfig.seasonsJson),
    intercalary: calendarConfig.intercalaryJson ? JSON.parse(calendarConfig.intercalaryJson) : [],
    moons: calendarConfig.moons,
    updatedAt: calendarConfig.updatedAt,
  };

  const currentParsed = parseDate(currentDate);
  const tomorrowParsed = advanceDate(currentParsed, parsedConfig);
  const tomorrowDateStr = formatDate(tomorrowParsed);

  const todaySeasonName = getCurrentSeason(currentParsed, parsedConfig)?.name ?? null;
  const tomorrowSeasonName = getCurrentSeason(tomorrowParsed, parsedConfig)?.name ?? null;

  // Filter helper: mirrors the logic in the advance route
  function tablePassesFilter(raw: any, seasonName: string | null): boolean {
    const regionIds: string[] = raw.regions.map((r: any) => r.regionId);
    if (regionIds.length > 0 && !regionIds.includes(currentRegionId)) return false;
    return seasonFilterPasses(raw, seasonName);
  }

  function regionSetKey(raw: any): string {
    const ids: string[] = raw.regions.map((r: any) => r.regionId);
    return ids.slice().sort().join(",");
  }

  const { todayRolls: finalTodayRolls, forecastRolls } = await prisma.$transaction(async (tx) => {
    // Fetch all CALENDAR tables (with full include for rolling)
    const allCalendarTables = await tx.randomTable.findMany({
      where: { campaignId, category: "CALENDAR", rollOnDayAdvance: true },
      include: tableInclude,
    });

    // ── Today's weather ─────────────────────────────────────────────────────────
    // Use stored data if available; otherwise roll fresh and persist.

    let localTodayRolls = todayRolls;

    if (localTodayRolls.length === 0) {
      const freshTodayRolls: RollResult[] = [];
      for (const raw of allCalendarTables) {
        if (!tablePassesFilter(raw, todaySeasonName)) continue;
        const table = shapeTable(raw);
        // Stateful tables: restore the last known result rather than rolling fresh
        if (raw.isStateful && raw.lastModifiedResult != null) {
          freshTodayRolls.push({
            tableId: raw.id,
            tableName: raw.name,
            outcome: lookupOutcomeByRoll(raw.lastModifiedResult, table),
            roll: raw.lastModifiedResult,
          });
          continue;
        }
        const result = rollOnTable(table, currentRegionId, []);
        freshTodayRolls.push({
          tableId: raw.id,
          tableName: raw.name,
          outcome: result.resolvedOutcome.expandedText,
          roll: result.diceTotal,
        });
      }
      if (freshTodayRolls.length > 0) {
        localTodayRolls = freshTodayRolls;
        await tx.campaignState.update({
          where: { campaignId },
          data: { todayWeatherJson: JSON.stringify(freshTodayRolls) },
        });
      }
    }

    // ── Tomorrow's forecast ─────────────────────────────────────────────────────
    // Look for stored forecast data (include global tables that have no regions).

    const forecastTables = await tx.randomTable.findMany({
      where: {
        campaignId,
        category: "CALENDAR",
        rollOnDayAdvance: true,
        forecastDate: tomorrowDateStr,
        forecastOutcome: { not: null },
        OR: [
          { regions: { some: { regionId: currentRegionId } } },
          { regions: { none: {} } },
        ],
      },
    });

    let localForecastRolls: RollResult[] = forecastTables.map((t) => ({
      tableId: t.id,
      tableName: t.name,
      outcome: t.forecastOutcome!,
      roll: t.forecastModifiedResult ?? 0,
    }));

    // If no stored forecast, roll tomorrow fresh and persist so later reloads use it.
    if (localForecastRolls.length === 0) {
      // Build lookup maps from today's results for PREV_RESULT_CONDITION chaining
      const todayById = new Map<string, { diceTotal: number }>();
      for (const r of localTodayRolls) {
        todayById.set(r.tableId, { diceTotal: r.roll });
      }

      const todayByRegionSet = new Map<string, { diceTotal: number }>();
      for (const raw of allCalendarTables) {
        if (!tablePassesFilter(raw, todaySeasonName)) continue;
        const todayResult = todayById.get(raw.id);
        if (todayResult) {
          todayByRegionSet.set(regionSetKey(raw), todayResult);
        }
      }

      const freshForecastRolls: RollResult[] = [];
      for (const raw of allCalendarTables) {
        if (!tablePassesFilter(raw, tomorrowSeasonName)) continue;
        const prevToday = todayById.get(raw.id) ?? todayByRegionSet.get(regionSetKey(raw)) ?? null;
        const prevDiceTotal = prevToday?.diceTotal ?? raw.lastModifiedResult ?? null;
        const table = shapeTable(raw);
        const tableForTomorrow: RandomTable = { ...table, lastModifiedResult: prevDiceTotal };
        const result = rollOnTable(tableForTomorrow, currentRegionId, []);
        freshForecastRolls.push({
          tableId: raw.id,
          tableName: raw.name,
          outcome: result.resolvedOutcome.expandedText,
          roll: result.diceTotal,
        });
        await tx.randomTable.update({
          where: { id: raw.id },
          data: {
            forecastResult: result.rawDiceTotal,
            forecastModifiedResult: result.diceTotal,
            forecastDate: tomorrowDateStr,
            forecastOutcome: result.resolvedOutcome.expandedText,
          },
        });
      }
      localForecastRolls = freshForecastRolls;
    }

    return { todayRolls: localTodayRolls, forecastRolls: localForecastRolls };
  }, { timeout: 30000 });

  // ── Encounters ────────────────────────────────────────────────────────────────

  let dayEncounter: EncounterSummary | null = null;
  let nightEncounter: EncounterSummary | null = null;
  // One entry per configured encounter window (superset of day/night above).
  let encounters: EncounterSummary[] = [];

  if (encounterTableOverrideId || currentRegionId) {
    const encounterRaw = encounterTableOverrideId
      ? await prisma.randomTable.findUnique({ where: { id: encounterTableOverrideId }, include: tableInclude })
      : await prisma.randomTable.findFirst({
          where: { campaignId, category: "ENCOUNTER", regions: { some: { regionId: currentRegionId } } },
          include: tableInclude,
        });

    if (encounterRaw) {
      const encounterTable = shapeTable(encounterRaw);

      const reactionRaw = campaign.defaultReactionTableId
        ? await prisma.randomTable.findUnique({ where: { id: campaign.defaultReactionTableId }, include: tableInclude })
        : await prisma.randomTable.findFirst({ where: { campaignId, category: "REACTION" }, include: tableInclude });
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

  return NextResponse.json({ todayRolls: finalTodayRolls, forecastRolls, dayEncounter, nightEncounter, encounters });
}
