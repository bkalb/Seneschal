/**
 * POST /api/calendar/reroll-region
 *
 * Called when the GM switches to a region with rerollOnSwitch=true.
 * Weather is NOT re-rolled — the existing lastModifiedResult from each CALENDAR
 * table is mapped onto the new region's table (same number, different flavour).
 * Encounters ARE rolled fresh against the new region's ENCOUNTER table.
 * Results are appended to today's calendar note.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { shapeTable, tableInclude } from "@/lib/tables/shape-table";
import { rollEncounterFull, rollEncounterForWindows, lookupOutcomeByRoll } from "@/lib/tables/encounter-roll";
import { parseEncounterWindows } from "@/lib/encounter-timing";
import { buildDoc, appendToDoc, buildDaySummaryNodes } from "@/lib/calendar/note-builder";
import type { EncounterSummary } from "@/lib/tables/encounter-roll";

const schema = z.object({
  campaignId: z.string(),
  regionId: z.string(),
  regionName: z.string(),
  currentDate: z.string(), // "YYYY-MM-DD"
  encounterTableOverrideId: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { campaignId, regionId, regionName, currentDate, encounterTableOverrideId = null } = parsed.data;

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ── Weather: map existing lastModifiedResult to the new region's tables ───────

  const weatherRolls: { tableId: string; tableName: string; outcome: string; roll: number }[] = [];

  const calendarTablesForRegion = await prisma.randomTable.findMany({
    where: {
      campaignId,
      category: "CALENDAR",
      rollOnDayAdvance: true,
      regions: { some: { regionId } },
    },
    include: tableInclude,
  });

  // Find the most recent weather result from any same-named (or any) CALENDAR table
  // to use as the roll value for the new region's table.
  const anyCalendarTable = await prisma.randomTable.findFirst({
    where: { campaignId, category: "CALENDAR", lastModifiedResult: { not: null } },
    orderBy: { updatedAt: "desc" },
  });
  const existingRoll = anyCalendarTable?.lastModifiedResult ?? null;

  for (const raw of calendarTablesForRegion) {
    const table = shapeTable(raw);
    const rollValue = existingRoll ?? raw.lastModifiedResult ?? raw.lastResult;
    if (rollValue === null || rollValue === undefined) continue;
    const outcome = lookupOutcomeByRoll(rollValue, table);
    weatherRolls.push({ tableId: raw.id, tableName: raw.name, outcome, roll: rollValue });
  }

  // ── Encounters: roll fresh on the new region's ENCOUNTER table ────────────────

  let dayEncounter: EncounterSummary | null = null;
  let nightEncounter: EncounterSummary | null = null;
  // One entry per configured encounter window (superset of day/night above).
  let encounters: EncounterSummary[] = [];

  const encounterRaw = encounterTableOverrideId
    ? await prisma.randomTable.findUnique({ where: { id: encounterTableOverrideId }, include: tableInclude })
    : await prisma.randomTable.findFirst({
        where: { campaignId, category: "ENCOUNTER", regions: { some: { regionId } } },
        include: tableInclude,
      });

  if (encounterRaw) {
    const encounterTable = shapeTable(encounterRaw);

    const reactionRaw = campaign.defaultReactionTableId
      ? await prisma.randomTable.findUnique({ where: { id: campaign.defaultReactionTableId }, include: tableInclude })
      : await prisma.randomTable.findFirst({ where: { campaignId, category: "REACTION" }, include: tableInclude });
    const reactionTable = reactionRaw ? shapeTable(reactionRaw) : null;

    const windows = parseEncounterWindows((campaign as any).encounterWindowsJson ?? "[]");

    const rollParams = {
      table: encounterTable,
      reactionTable,
      regionId,
      campaignDefaultSurpriseDice: campaign.defaultSurpriseDice,
      campaignDefaultSurpriseThreshold: campaign.defaultSurpriseThreshold,
    };

    // One roll per configured window. `day`/`night` are kept populated from
    // window 0 / window 1 for back-compat with existing readers.
    encounters = rollEncounterForWindows(windows, rollParams);
    dayEncounter = encounters[0] ?? null;
    nightEncounter = encounters[1] ?? null;
  }

  // ── Append to today's calendar note ──────────────────────────────────────────

  const noteNodes = buildDaySummaryNodes({
    weatherRolls,
    dayEncounter,
    nightEncounter,
    isRegionReroll: true,
    regionName,
  });

  if (noteNodes.length > 0) {
    const existing = await prisma.calendarNote.findFirst({ where: { campaignId, date: currentDate } });
    if (existing) {
      await prisma.calendarNote.update({
        where: { id: existing.id },
        data: { content: appendToDoc(existing.content, noteNodes) },
      });
    } else {
      await prisma.calendarNote.create({
        data: { campaignId, date: currentDate, content: buildDoc(noteNodes) },
      });
    }
  }

  return NextResponse.json({ weatherRolls, dayEncounter, nightEncounter, encounters });
}
