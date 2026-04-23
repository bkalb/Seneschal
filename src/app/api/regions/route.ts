import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

const createSchema = z.object({
  campaignId: z.string(),
  name: z.string().min(1).max(100),
  regionType: z.enum(["OVERLAND", "DUNGEON", "BOTH"]).optional(),
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

  const regions = await prisma.region.findMany({
    where: { campaignId },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(regions);
}

export async function POST(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Verify the campaign belongs to this user
  const campaign = await prisma.campaign.findUnique({ where: { id: parsed.data.campaignId } });
  if (!campaign || campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const region = await prisma.region.create({
    data: {
      campaignId: parsed.data.campaignId,
      name: parsed.data.name,
      regionType: parsed.data.regionType ?? "OVERLAND",
    },
  });

  return NextResponse.json(region, { status: 201 });
}
