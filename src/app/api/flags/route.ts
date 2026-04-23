import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

const createSchema = z.object({
  campaignId: z.string(),
  label: z.string().min(1).max(200),
  color: z.string().default("#fecdd3"),
  counter: z.number().int().nullable().optional(),
  countDirection: z.enum(["up", "down"]).nullable().optional(),
  paused: z.boolean().optional(),
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

  const flags = await prisma.campaignFlag.findMany({
    where: { campaignId },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(flags);
}

export async function POST(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: parsed.data.campaignId } });
  if (!campaign || campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Place at end of current list
  const maxOrder = await prisma.campaignFlag.aggregate({
    where: { campaignId: parsed.data.campaignId },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

  const flag = await prisma.campaignFlag.create({
    data: {
      campaignId: parsed.data.campaignId,
      label: parsed.data.label,
      color: parsed.data.color,
      counter: parsed.data.counter ?? null,
      countDirection: parsed.data.countDirection ?? null,
      paused: parsed.data.paused ?? false,
      sortOrder,
    },
  });

  return NextResponse.json(flag, { status: 201 });
}
