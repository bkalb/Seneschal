import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

const recurrenceEnum = z.enum(["ONCE", "ANNUAL", "MONTHLY", "MOON_PHASE"]);

const patchSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  recurrence: recurrenceEnum.optional(),
  anchorDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  moonId: z.string().nullable().optional(),
  moonPhase: z.string().nullable().optional(),
  color: z.string().optional(),
});

async function getEventForUser(id: string, userId: string) {
  const event = await prisma.calendarEvent.findUnique({
    where: { id },
    include: { campaign: true },
  });
  if (!event || event.campaign.userId !== userId) return null;
  return event;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await getEventForUser(id, userId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const event = await prisma.calendarEvent.update({ where: { id }, data: parsed.data });
  return NextResponse.json(event);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await getEventForUser(id, userId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.calendarEvent.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
