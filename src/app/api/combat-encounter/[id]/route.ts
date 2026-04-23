import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

async function getForUser(id: string, userId: string) {
  const encounter = await prisma.combatEncounter.findUnique({
    where: { id },
    include: { campaign: true },
  });
  if (!encounter || encounter.campaign.userId !== userId) return null;
  return encounter;
}

const patchSchema = z.object({
  action: z.literal("advance-round"),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const encounter = await getForUser(id, userId);
  if (!encounter) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await prisma.combatSide.updateMany({
    where: { encounterId: id },
    data: { actedThisRound: false },
  });

  const updated = await prisma.combatEncounter.update({
    where: { id },
    data: { currentRound: { increment: 1 } },
    include: {
      sides: {
        orderBy: { sortOrder: "asc" },
        include: { combatants: { orderBy: { sortOrder: "asc" } } },
      },
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
  const encounter = await getForUser(id, userId);
  if (!encounter) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.combatEncounter.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
