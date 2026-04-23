import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

const createSchema = z.object({
  name: z.string().min(1).max(100),
});

export async function GET() {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaigns = await prisma.campaign.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { state: { include: { currentRegion: true } } },
  });

  return NextResponse.json(campaigns);
}

export async function POST(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const campaign = await prisma.campaign.create({
    data: {
      userId,
      name: parsed.data.name,
      state: {
        create: { currentDate: "0001-01-01" },
      },
    },
    include: { state: { include: { currentRegion: true } } },
  });

  return NextResponse.json(campaign, { status: 201 });
}
