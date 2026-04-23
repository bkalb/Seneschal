import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { parseDate, formatDate, advanceDate, getCurrentSeason } from "@/lib/calendar/engine";
import { rollOnTable } from "@/lib/tables/engine";
import { shapeTable, tableInclude } from "@/lib/tables/shape-table";
import { rollEncounterFull } from "@/lib/tables/encounter-roll";
import { rollEncounterTime, parseEncounterWindows } from "@/lib/encounter-timing";
import { buildDoc, appendToDoc, buildDaySummaryNodes } from "@/lib/calendar/note-builder";
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
  const forecastingMode = (campaign.state as any)?.forecastingMode ?? false;

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

  // Update CampaignState (todayWeatherJson written after rolls are computed — see below)
  await prisma.campaignState.upsert({
    where: { campaignId },
    create: { campaignId, currentDate: newDateStr },
    update: { currentDate: newDateStr },
  });

  // ── Weather (CALENDAR tables) ─────────────────────────────────────────────────

  const calendarTables = await prisma.randomTable.findMany({
    where: { campaignId, category: "CALENDAR", rollOnDayAdvance: true },
    include: tableInclude,
  });

  const weatherRolls: { tableId: string; tableName: string; outcome: string; roll: number }[] = [];
  const forecastRolls: { tableId: string; tableName: string; outcome: string; roll: number }[] = [];

  // Helper: does this table pass the region + season filter for a given date/season?
  function tablePassesFilter(raw: any, seasonName: string | null): boolean {
    const regionIds = raw.regions.map((r: any) => r.regionId);
    if (regionIds.length > 0 && (!currentRegionId || !regionIds.includes(currentRegionId))) return false;
    if (raw.seasonName) {
      const allowed = raw.seasonName.split(",").map((s: string) => s.trim());
      if (!seasonName || !allowed.includes(seasonName)) {
        return raw.rollWhenNoSeason === "always";
      }
    }
    return true;
  }

  // ── Pass 1: today's results ───────────────────────────────────────────────────
  // Keyed by tableId and by name so tomorrow's pass can find relevant prev results.

  // Canonical key for a table's region set: sorted IDs joined, or "" for "all regions".
  function regionSetKey(raw: any): string {
    const ids: string[] = raw.regions.map((r: any) => r.regionId);
    return ids.slice().sort().join(",");
  }

  interface TodayResult { rawDice: number; diceTotal: number; outcome: string }
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
      const needsPersist = raw.isStateful || raw.modifiers.some((m: any) => m.behavior === "PREV_RESULT_CONDITION");
      if (needsPersist) {
        prisma.randomTable.update({
          where: { id: raw.id },
          data: { lastResult: rawDice, lastModifiedResult: diceTotal },
        }).catch(() => {});
      }
    }
  }

  // Persist today's weather rolls so they can be restored on page reload
  if (weatherRolls.length > 0) {
    prisma.campaignState.update({
      where: { campaignId },
      data: { todayWeatherJson: JSON.stringify(weatherRolls) },
    }).catch(() => {});
  }

  // ── Pass 2: tomorrow's forecast (forecasting mode only) ───────────────────────
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
          prisma.randomTable.update({
            where: { id: raw.id },
            data: {
              lastResult: todayResult.rawDice,
              lastModifiedResult: todayResult.diceTotal,
              forecastResult: null,
              forecastModifiedResult: null,
              forecastDate: null,
              forecastOutcome: null,
            },
          }).catch(() => {});
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
      prisma.randomTable.update({
        where: { id: raw.id },
        data: {
          // Persist today's result for tables that rolled today; leave unchanged for others
          ...(todayResult ? { lastResult: todayResult.rawDice, lastModifiedResult: todayResult.diceTotal } : {}),
          forecastResult: tomorrowResult.rawDiceTotal,
          forecastModifiedResult: tomorrowResult.diceTotal,
          forecastDate: tomorrowDateStr,
          forecastOutcome: tomorrowResult.resolvedOutcome.expandedText,
        },
      }).catch(() => {});
    }
  }

  // ── Encounters ────────────────────────────────────────────────────────────────
  // Only roll if there is an ENCOUNTER table scoped to the current region.

  let dayEncounter: EncounterSummary | null = null;
  let nightEncounter: EncounterSummary | null = null;

  if (encounterTableOverrideId || currentRegionId) {
    const encounterRaw = encounterTableOverrideId
      ? await prisma.randomTable.findUnique({ where: { id: encounterTableOverrideId }, include: tableInclude })
      : await prisma.randomTable.findFirst({
          where: { campaignId, category: "ENCOUNTER", regions: { some: { regionId: currentRegionId! } } },
          include: tableInclude,
        });

    if (encounterRaw) {
      const encounterTable = shapeTable(encounterRaw);

      // Reaction table: campaign default → first REACTION table
      const reactionRaw = campaign.defaultReactionTableId
        ? await prisma.randomTable.findUnique({ where: { id: campaign.defaultReactionTableId }, include: tableInclude })
        : await prisma.randomTable.findFirst({ where: { campaignId, category: "REACTION" }, include: tableInclude });
      const reactionTable = reactionRaw ? shapeTable(reactionRaw) : null;

      const windows = parseEncounterWindows((campaign as any).encounterWindowsJson ?? "[]");
      const dayWindow = windows[0] ?? null;
      const nightWindow = windows[1] ?? null;

      const rollParams = {
        table: encounterTable,
        reactionTable,
        regionId: currentRegionId,
        campaignDefaultSurpriseDice: campaign.defaultSurpriseDice,
        campaignDefaultSurpriseThreshold: campaign.defaultSurpriseThreshold,
      };

      const dayResult = rollEncounterFull(rollParams);
      dayEncounter = {
        label: dayWindow?.name ?? "Day",
        time: dayWindow ? rollEncounterTime(dayWindow) : null,
        outcome: dayResult.resolvedOutcome.expandedText,
        roll: dayResult.diceTotal,
        reaction: dayResult.reaction ?? null,
        surprise: dayResult.surprise ?? null,
        prerequisiteRoll: dayResult.prerequisiteRoll ?? null,
      };

      const nightResult = rollEncounterFull(rollParams);
      nightEncounter = {
        label: nightWindow?.name ?? "Night",
        time: nightWindow ? rollEncounterTime(nightWindow) : null,
        outcome: nightResult.resolvedOutcome.expandedText,
        roll: nightResult.diceTotal,
        reaction: nightResult.reaction ?? null,
        surprise: nightResult.surprise ?? null,
        prerequisiteRoll: nightResult.prerequisiteRoll ?? null,
      };
    }
  }

  // ── Calendar note ─────────────────────────────────────────────────────────────

  const noteNodes = buildDaySummaryNodes({ weatherRolls, dayEncounter, nightEncounter });

  if (noteNodes.length > 0) {
    const existing = await prisma.calendarNote.findFirst({ where: { campaignId, date: newDateStr } });
    if (existing) {
      await prisma.calendarNote.update({
        where: { id: existing.id },
        data: { content: appendToDoc(existing.content, noteNodes) },
      });
    } else {
      await prisma.calendarNote.create({
        data: { campaignId, date: newDateStr, content: buildDoc(noteNodes) },
      });
    }
  }

  // ── Flag counters ─────────────────────────────────────────────────────────────

  const flags = await prisma.campaignFlag.findMany({
    where: { campaignId, paused: false, counter: { not: null }, countDirection: { not: null } },
  });
  for (const flag of flags) {
    const newCounter =
      flag.countDirection === "up"
        ? (flag.counter ?? 0) + 1
        : Math.max(0, (flag.counter ?? 0) - 1);
    prisma.campaignFlag.update({ where: { id: flag.id }, data: { counter: newCounter } }).catch(() => {});
  }

  return NextResponse.json({
    newDate: newDateStr,
    dailyRolls: weatherRolls,
    forecastRolls,
    dayEncounter,
    nightEncounter,
  });
}
