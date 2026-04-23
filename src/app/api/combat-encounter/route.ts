import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

const createSchema = z.object({
  campaignId: z.string(),
  name: z.string().nullable().optional(),
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

  const encounter = await prisma.combatEncounter.findFirst({
    where: { campaignId, isActive: true },
    include: {
      sides: {
        orderBy: { sortOrder: "asc" },
        include: {
          combatants: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });

  return NextResponse.json(encounter ?? null);
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

  // Deactivate any existing active encounters for this campaign
  await prisma.combatEncounter.updateMany({
    where: { campaignId, isActive: true },
    data: { isActive: false },
  });

  const encounter = await prisma.combatEncounter.create({
    data: {
      campaignId,
      name: name ?? null,
      isActive: true,
      sides: { create: { name: "PCs", sortOrder: 0, isPlayerSide: true } },
    },
    include: {
      sides: {
        orderBy: { sortOrder: "asc" },
        include: { combatants: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });

  return NextResponse.json(encounter, { status: 201 });
}
