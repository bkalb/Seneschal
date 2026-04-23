import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

const createSchema = z.object({
  campaignId: z.string(),
  title: z.string().min(1).max(200),
  content: z.string().default("{}"),
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

  const sections = await prisma.rulesSection.findMany({
    where: { campaignId },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(sections);
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

  // Place new section at the end
  const maxOrder = await prisma.rulesSection.aggregate({
    where: { campaignId: parsed.data.campaignId },
    _max: { sortOrder: true },
  });

  const section = await prisma.rulesSection.create({
    data: {
      campaignId: parsed.data.campaignId,
      title: parsed.data.title,
      content: parsed.data.content,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  });

  return NextResponse.json(section, { status: 201 });
}
