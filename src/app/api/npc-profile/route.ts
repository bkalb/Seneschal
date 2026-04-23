import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { npcProfileConfigSchema } from "@/lib/npc/schemas";

const createSchema = z.object({
  campaignId: z.string(),
  name: z.string().min(1).max(100),
  config: npcProfileConfigSchema.optional(),
});

function normalize(p: { id: string; campaignId: string; name: string; stepsJson: string; sortOrder: number }) {
  let config;
  try {
    const parsed = JSON.parse(p.stepsJson);
    // If it looks like the new format (has typeLabel key) use it directly; otherwise return empty config
    config = parsed && typeof parsed === "object" && !Array.isArray(parsed) && "typeLabel" in parsed
      ? parsed
      : { typeLabel: "Type", secondaryTypeLabel: null, typeTableId: null, secondaryTypeTableId: null, ageTableId: null, physicalTableIds: [], personalityTableIds: [], detailTableIds: [] };
  } catch {
    config = { typeLabel: "Type", secondaryTypeLabel: null, typeTableId: null, secondaryTypeTableId: null, ageTableId: null, physicalTableIds: [], personalityTableIds: [], detailTableIds: [] };
  }
  return { id: p.id, campaignId: p.campaignId, name: p.name, sortOrder: p.sortOrder, config };
}

export async function GET(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaignId = request.nextUrl.searchParams.get("campaignId");
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const profiles = await prisma.npcProfile.findMany({
    where: { campaignId },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(profiles.map(normalize));
}

export async function POST(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { campaignId, name, config } = parsed.data;

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const max = await prisma.npcProfile.aggregate({
    where: { campaignId },
    _max: { sortOrder: true },
  });

  const defaultConfig = { typeLabel: "Type", secondaryTypeLabel: null, typeTableId: null, secondaryTypeTableId: null, ageTableId: null, physicalTableIds: [], personalityTableIds: [], detailTableIds: [] };

  const profile = await prisma.npcProfile.create({
    data: {
      campaignId,
      name,
      stepsJson: JSON.stringify(config ?? defaultConfig),
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });

  return NextResponse.json(normalize(profile), { status: 201 });
}
