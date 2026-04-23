import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

const updateSchema = z.object({
  campaignId: z.string(),
  currentRegionId: z.string().nullable().optional(),
  currentDate: z.string().optional(),
  mode: z.enum(["OVERLAND", "DUNGEON", "COMBAT"]).optional(),
  currentTime: z.string().optional(),
  currentDungeonRegionId: z.string().nullable().optional(),
  forecastingMode: z.boolean().optional(),
});

export async function PATCH(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { campaignId, currentRegionId, currentDate, mode, currentTime, currentDungeonRegionId, forecastingMode } = parsed.data;

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.campaignState.upsert({
    where: { campaignId },
    update: {
      ...(currentRegionId !== undefined ? { currentRegionId } : {}),
      ...(currentDate !== undefined ? { currentDate } : {}),
      ...(mode !== undefined ? { mode } : {}),
      ...(currentTime !== undefined ? { currentTime } : {}),
      ...(currentDungeonRegionId !== undefined ? { currentDungeonRegionId } : {}),
      ...(forecastingMode !== undefined ? { forecastingMode } : {}),
    },
    create: {
      campaignId,
      currentRegionId: currentRegionId ?? null,
      currentDate: currentDate ?? "0001-01-01",
      mode: mode ?? "OVERLAND",
      currentTime: currentTime ?? "12:00 PM",
      currentDungeonRegionId: currentDungeonRegionId ?? null,
      forecastingMode: forecastingMode ?? false,
    },
    include: { currentRegion: true },
  });

  return NextResponse.json(updated);
}
