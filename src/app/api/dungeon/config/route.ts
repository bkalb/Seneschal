import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

const saveSchema = z.object({
  campaignId: z.string(),
  turnsPerHour: z.number().int().min(1).max(60),
  encounterTurns: z.array(z.number().int().min(1)),
});

async function ownsCampaign(userId: string, campaignId: string) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  return c?.userId === userId ? c : null;
}

export async function GET(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaignId = request.nextUrl.searchParams.get("campaignId");
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  if (!(await ownsCampaign(userId, campaignId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const config = await prisma.dungeonConfig.findUnique({ where: { campaignId } });
  if (!config) {
    return NextResponse.json({ turnsPerHour: 6, encounterTurns: [2, 5] });
  }
  return NextResponse.json({
    turnsPerHour: config.turnsPerHour,
    encounterTurns: JSON.parse(config.encounterTurnsJson),
  });
}

export async function PATCH(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { campaignId, turnsPerHour, encounterTurns } = parsed.data;
  if (!(await ownsCampaign(userId, campaignId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const config = await prisma.dungeonConfig.upsert({
    where: { campaignId },
    update: { turnsPerHour, encounterTurnsJson: JSON.stringify(encounterTurns) },
    create: { campaignId, turnsPerHour, encounterTurnsJson: JSON.stringify(encounterTurns) },
  });

  return NextResponse.json({
    turnsPerHour: config.turnsPerHour,
    encounterTurns: JSON.parse(config.encounterTurnsJson),
  });
}
