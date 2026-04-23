import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import type { NpcAffiliation } from "@prisma/client";
import type { NpcAffiliationData } from "@/types/savedNpc";

function normalize(aff: NpcAffiliation): NpcAffiliationData {
  return {
    id: aff.id,
    campaignId: aff.campaignId,
    name: aff.name,
    createdAt: aff.createdAt.toISOString(),
  };
}

const createSchema = z.object({
  campaignId: z.string(),
  name: z.string().min(1).max(100),
});

export async function GET(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaignId = request.nextUrl.searchParams.get("campaignId");
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const affiliations = await prisma.npcAffiliation.findMany({
    where: { campaignId },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(affiliations.map(normalize));
}

export async function POST(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { campaignId, name } = parsed.data;

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await prisma.npcAffiliation.findFirst({ where: { campaignId, name } });
  if (existing) return NextResponse.json(normalize(existing), { status: 200 });

  const aff = await prisma.npcAffiliation.create({ data: { campaignId, name } });
  return NextResponse.json(normalize(aff), { status: 201 });
}
