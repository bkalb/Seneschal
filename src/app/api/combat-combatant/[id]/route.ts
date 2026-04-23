import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  currentHp: z.number().int().optional(),
  maxHp: z.number().int().min(1).optional(),
  ac: z.number().int().optional(),
  hd: z.string().min(1).optional(),
  attackBonus: z.number().int().optional(),
  attackDamage: z.string().min(1).optional(),
});

async function getForUser(id: string, userId: string) {
  const combatant = await prisma.combatCombatant.findUnique({
    where: { id },
    include: { side: { include: { encounter: { include: { campaign: true } } } } },
  });
  if (!combatant || combatant.side.encounter.campaign.userId !== userId) return null;
  return combatant;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await getForUser(id, userId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  const updated = await prisma.combatCombatant.update({
    where: { id },
    data: {
      ...(d.name !== undefined && { name: d.name }),
      ...(d.currentHp !== undefined && { currentHp: d.currentHp }),
      ...(d.maxHp !== undefined && { maxHp: d.maxHp }),
      ...(d.ac !== undefined && { ac: d.ac }),
      ...(d.hd !== undefined && { hd: d.hd }),
      ...(d.attackBonus !== undefined && { attackBonus: d.attackBonus }),
      ...(d.attackDamage !== undefined && { attackDamage: d.attackDamage }),
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
  const existing = await getForUser(id, userId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.combatCombatant.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
