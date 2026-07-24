import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

const recurrenceEnum = z.enum(["ONCE", "ANNUAL", "MONTHLY", "MOON_PHASE"]);

const createSchema = z.object({
  campaignId: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  recurrence: recurrenceEnum.default("ONCE"),
  anchorDate: z.string(),
  endDate: z.string().nullable().optional(),
  moonId: z.string().nullable().optional(),
  moonPhase: z.string().nullable().optional(),
  color: z.string().default("#93c5fd"),
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

  const events = await prisma.calendarEvent.findMany({
    where: { campaignId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(events);
}

export async function POST(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { campaignId, title, description, recurrence, anchorDate, endDate, moonId, moonPhase, color } = parsed.data;

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const event = await prisma.calendarEvent.create({
    data: {
      campaignId,
      title,
      description: description ?? null,
      recurrence,
      anchorDate,
      endDate: endDate ?? null,
      moonId: moonId ?? null,
      moonPhase: moonPhase ?? null,
      color,
    },
  });
  return NextResponse.json(event, { status: 201 });
}
