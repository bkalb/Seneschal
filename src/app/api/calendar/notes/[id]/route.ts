import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

const patchSchema = z.object({ content: z.string() });

async function getNoteForUser(id: string, userId: string) {
  const note = await prisma.calendarNote.findUnique({
    where: { id },
    include: { campaign: true },
  });
  if (!note || note.campaign.userId !== userId) return null;
  return note;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await getNoteForUser(id, userId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const note = await prisma.calendarNote.update({ where: { id }, data: { content: parsed.data.content } });
  return NextResponse.json(note);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await getNoteForUser(id, userId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.calendarNote.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
