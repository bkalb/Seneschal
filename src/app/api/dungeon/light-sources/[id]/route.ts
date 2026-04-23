import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

async function ownsType(userId: string, id: string) {
  const t = await prisma.lightSourceType.findUnique({ where: { id }, include: { campaign: true } });
  return t?.campaign.userId === userId ? t : null;
}

async function ownsActive(userId: string, id: string) {
  const a = await prisma.activeLightSource.findUnique({ where: { id }, include: { campaign: true } });
  return a?.campaign.userId === userId ? a : null;
}

const updateTypeSchema = z.object({
  kind: z.literal("type"),
  name: z.string().min(1).max(100).optional(),
  defaultDuration: z.number().int().min(1).optional(),
});

const updateActiveSchema = z.object({
  kind: z.literal("active"),
  remainingTurns: z.number().int().min(0).optional(),
  paused: z.boolean().optional(),
  carrierName: z.string().min(1).max(100).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  if (body.kind === "type") {
    const parsed = updateTypeSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    if (!(await ownsType(userId, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { name, defaultDuration } = parsed.data;
    const updated = await prisma.lightSourceType.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(defaultDuration !== undefined && { defaultDuration }),
      },
    });
    return NextResponse.json(updated);
  }

  // active
  const parsed = updateActiveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (!(await ownsActive(userId, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { remainingTurns, paused, carrierName } = parsed.data;
  const updated = await prisma.activeLightSource.update({
    where: { id },
    data: {
      ...(remainingTurns !== undefined && { remainingTurns }),
      ...(paused !== undefined && { paused }),
      ...(carrierName !== undefined && { carrierName }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Try active first, then type
  const active = await ownsActive(userId, id);
  if (active) {
    await prisma.activeLightSource.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  }
  const type = await ownsType(userId, id);
  if (type) {
    await prisma.lightSourceType.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
