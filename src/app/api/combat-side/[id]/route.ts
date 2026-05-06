import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

const patchSideSchema = z.object({
  name: z.string().min(1).optional(),
  actedThisRound: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const addCombatantSchema = z.object({
  name: z.string().min(1),
  count: z.number().int().min(1).max(100).default(1),
  ac: z.number().int(),
  hd: z.string().min(1),
  maxHp: z.number().int().min(1).optional(),
  maxHps: z.array(z.number().int().min(1)).optional(),
  attackCount: z.number().int().min(1).default(1),
  attackBonus: z.number().int(),
  attackDamage: z.string().min(1),
}).refine((d) => d.maxHp != null || (d.maxHps != null && d.maxHps.length > 0), {
  message: "Either maxHp or maxHps must be provided",
});

async function getForUser(id: string, userId: string) {
  const side = await prisma.combatSide.findUnique({
    where: { id },
    include: { encounter: { include: { campaign: true } } },
  });
  if (!side || side.encounter.campaign.userId !== userId) return null;
  return side;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const side = await getForUser(id, userId);
  if (!side) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = patchSideSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await prisma.combatSide.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json(updated);
}

// POST to /api/combat-side/[id] adds a single combatant to an existing side
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const side = await getForUser(id, userId);
  if (!side) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = addCombatantSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { name, count, ac, hd, maxHp, maxHps, attackCount, attackBonus, attackDamage } = parsed.data;
  const existingCount = await prisma.combatCombatant.count({ where: { sideId: id } });

  if (count === 1) {
    const hp = maxHps ? maxHps[0] : maxHp!;
    const combatant = await prisma.combatCombatant.create({
      data: {
        sideId: id,
        name,
        sortOrder: existingCount,
        ac,
        hd,
        maxHp: hp,
        currentHp: hp,
        attackCount,
        attackBonus,
        attackDamage,
      },
    });
    return NextResponse.json(combatant, { status: 201 });
  }

  // Bulk add
  await prisma.combatCombatant.createMany({
    data: Array.from({ length: count }, (_, i) => {
      const hp = maxHps ? (maxHps[i] ?? maxHps[0]) : maxHp!;
      return {
        sideId: id,
        name: `${name} ${i + 1}`,
        sortOrder: existingCount + i,
        ac,
        hd,
        maxHp: hp,
        currentHp: hp,
        attackCount,
        attackBonus,
        attackDamage,
      };
    }),
  });

  const combatants = await prisma.combatCombatant.findMany({
    where: { sideId: id },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(combatants, { status: 201 });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const side = await getForUser(id, userId);
  if (!side) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.combatSide.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
