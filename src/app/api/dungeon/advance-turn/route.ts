import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { shapeTable, tableInclude } from "@/lib/tables/shape-table";
import { rollEncounterFull } from "@/lib/tables/encounter-roll";
import { parseEncounterWindows, rollEncounterTime } from "@/lib/encounter-timing";
import type { EncounterSummary } from "@/lib/tables/encounter-roll";

const schema = z.object({
  campaignId: z.string(),
  currentTime: z.string(), // "HH:MM AM/PM"
  currentDungeonRegionId: z.string().nullable().optional(),
  encounterTableOverrideId: z.string().nullable().optional(),
});

/** Parse "HH:MM AM/PM" → total minutes since midnight */
function parseTime(t: string): number {
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return 0;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const period = m[3].toUpperCase();
  if (period === "AM" && h === 12) h = 0;
  if (period === "PM" && h !== 12) h += 12;
  return h * 60 + min;
}

/** Format total minutes since midnight → "HH:MM AM/PM" */
function formatTime(totalMinutes: number): string {
  const wrapped = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h24 = Math.floor(wrapped / 60);
  const min = wrapped % 60;
  const period = h24 < 12 ? "AM" : "PM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(min).padStart(2, "0")} ${period}`;
}

export async function POST(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { campaignId, currentTime, currentDungeonRegionId = null, encounterTableOverrideId = null } = parsed.data;

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Load dungeon config (fall back to defaults)
  const rawConfig = await prisma.dungeonConfig.findUnique({ where: { campaignId } });
  const turnsPerHour = rawConfig?.turnsPerHour ?? 6;
  const encounterTurns: number[] = rawConfig ? JSON.parse(rawConfig.encounterTurnsJson) : [2, 5];
  const minutesPerTurn = 60 / turnsPerHour;

  // Advance time by one turn
  const newTotalMinutes = parseTime(currentTime) + minutesPerTurn;
  const newTime = formatTime(newTotalMinutes);

  // Persist new time to campaign state
  await prisma.campaignState.upsert({
    where: { campaignId },
    update: { currentTime: newTime },
    create: { campaignId, currentTime: newTime },
  });

  // Determine which turn number (1-indexed) within the current hour this is
  const newTotalMinsWrapped = ((Math.round(newTotalMinutes)) % (24 * 60) + 24 * 60) % (24 * 60);
  const minuteInHour = newTotalMinsWrapped % 60;
  const turnInHour = Math.round(minuteInHour / minutesPerTurn) || turnsPerHour;

  // Should we roll an encounter this turn?
  const shouldRollEncounter = encounterTurns.includes(turnInHour);

  let encounter: EncounterSummary | null = null;

  if (shouldRollEncounter && (encounterTableOverrideId || currentDungeonRegionId)) {
    const encounterRaw = encounterTableOverrideId
      ? await prisma.randomTable.findUnique({ where: { id: encounterTableOverrideId }, include: tableInclude })
      : await prisma.randomTable.findFirst({
          where: {
            campaignId,
            category: "ENCOUNTER",
            regions: { some: { regionId: currentDungeonRegionId! } },
          },
          include: tableInclude,
        });

    if (encounterRaw) {
      const encounterTable = shapeTable(encounterRaw);

      const reactionRaw = campaign.defaultReactionTableId
        ? await prisma.randomTable.findUnique({ where: { id: campaign.defaultReactionTableId }, include: tableInclude })
        : await prisma.randomTable.findFirst({ where: { campaignId, category: "REACTION" }, include: tableInclude });
      const reactionTable = reactionRaw ? shapeTable(reactionRaw) : null;

      const windows = parseEncounterWindows(campaign.encounterWindowsJson);
      const window = windows.find((w) => {
        // find the window that covers newTime
        const mins = parseTime(newTime);
        const start = w.startHour * 60 + w.startMinute;
        const end = w.endHour * 60 + w.endMinute;
        return start <= end ? mins >= start && mins < end : mins >= start || mins < end;
      }) ?? null;

      const result = rollEncounterFull({
        table: encounterTable,
        reactionTable,
        regionId: currentDungeonRegionId,
        campaignDefaultSurpriseDice: campaign.defaultSurpriseDice,
        campaignDefaultSurpriseThreshold: campaign.defaultSurpriseThreshold,
      });

      encounter = {
        label: window?.name ?? "Encounter",
        time: window ? rollEncounterTime(window) : newTime,
        outcome: result.resolvedOutcome.expandedText,
        roll: result.diceTotal,
        reaction: result.reaction ?? null,
        surprise: result.surprise ?? null,
        prerequisiteRoll: result.prerequisiteRoll ?? null,
      };
    }
  }

  // Tick down active light sources that are not paused
  const activeLights = await prisma.activeLightSource.findMany({
    where: { campaignId, paused: false },
  });
  for (const light of activeLights) {
    const newRemaining = Math.max(0, light.remainingTurns - 1);
    await prisma.activeLightSource.update({
      where: { id: light.id },
      data: { remainingTurns: newRemaining },
    });
  }

  return NextResponse.json({
    newTime,
    turnInHour,
    turnsPerHour,
    encounter,
    expiredLightSourceIds: activeLights
      .filter((l) => l.remainingTurns === 1) // was 1, now 0
      .map((l) => l.id),
  });
}
