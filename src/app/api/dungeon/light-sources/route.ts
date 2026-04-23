import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

async function ownsCampaign(userId: string, campaignId: string) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  return c?.userId === userId ? c : null;
}

// ── Light source types ────────────────────────────────────────────────────────

const createTypeSchema = z.object({
  campaignId: z.string(),
  name: z.string().min(1).max(100),
  defaultDuration: z.number().int().min(1),
});

export async function GET(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaignId = request.nextUrl.searchParams.get("campaignId");
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  if (!(await ownsCampaign(userId, campaignId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [types, active] = await Promise.all([
    prisma.lightSourceType.findMany({ where: { campaignId }, orderBy: { sortOrder: "asc" } }),
    prisma.activeLightSource.findMany({ where: { campaignId }, orderBy: { createdAt: "asc" } }),
  ]);

  return NextResponse.json({ types, active });
}

// Create a light source type
export async function POST(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  // Distinguish: creating a type vs activating a light source
  if (body.action === "activate") {
    const activateSchema = z.object({
      campaignId: z.string(),
      action: z.literal("activate"),
      typeId: z.string().nullable().optional(),
      name: z.string().min(1).max(200),
      carrierName: z.string().min(1).max(100),
      remainingTurns: z.number().int().min(1),
    });
    const parsed = activateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const { campaignId, typeId, name, carrierName, remainingTurns } = parsed.data;
    if (!(await ownsCampaign(userId, campaignId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const light = await prisma.activeLightSource.create({
      data: { campaignId, typeId: typeId ?? null, name, carrierName, remainingTurns },
    });
    return NextResponse.json(light, { status: 201 });
  }

  const parsed = createTypeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { campaignId, name, defaultDuration } = parsed.data;
  if (!(await ownsCampaign(userId, campaignId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const maxOrder = await prisma.lightSourceType.aggregate({
    where: { campaignId },
    _max: { sortOrder: true },
  });
  const type = await prisma.lightSourceType.create({
    data: { campaignId, name, defaultDuration, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
  });
  return NextResponse.json(type, { status: 201 });
}
