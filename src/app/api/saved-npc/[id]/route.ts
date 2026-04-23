import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import type { SavedNpc } from "@prisma/client";
import type { SavedNpcData } from "@/types/savedNpc";

function normalize(npc: SavedNpc): SavedNpcData {
  return {
    id: npc.id,
    campaignId: npc.campaignId,
    affiliationId: npc.affiliationId,
    name: npc.name,
    gender: npc.gender,
    age: npc.age,
    type: npc.type,
    typeLabel: npc.typeLabel,
    secondaryType: npc.secondaryType,
    secondaryTypeLabel: npc.secondaryTypeLabel,
    physical: JSON.parse(npc.physicalJson),
    personality: JSON.parse(npc.personalityJson),
    details: JSON.parse(npc.detailsJson),
    isDeceased: npc.isDeceased,
    isPinned: npc.isPinned,
    notes: npc.notes,
    isCombatant: npc.isCombatant,
    combatAc: npc.combatAc,
    combatHd: npc.combatHd,
    combatMaxHp: npc.combatMaxHp,
    combatAttackBonus: npc.combatAttackBonus,
    combatAttackDamage: npc.combatAttackDamage,
    createdAt: npc.createdAt.toISOString(),
    updatedAt: npc.updatedAt.toISOString(),
  };
}

const patchSchema = z.object({
  name: z.string().nullable().optional(),
  gender: z.enum(["male", "female"]).optional(),
  age: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  typeLabel: z.string().optional(),
  secondaryType: z.string().nullable().optional(),
  secondaryTypeLabel: z.string().nullable().optional(),
  physical: z.array(z.string()).optional(),
  personality: z.array(z.string()).optional(),
  details: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  affiliationId: z.string().nullable().optional(),
  isDeceased: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  isCombatant: z.boolean().optional(),
  combatAc: z.number().int().nullable().optional(),
  combatHd: z.string().nullable().optional(),
  combatMaxHp: z.number().int().nullable().optional(),
  combatAttackBonus: z.number().int().nullable().optional(),
  combatAttackDamage: z.string().nullable().optional(),
});

async function getForUser(id: string, userId: string) {
  const npc = await prisma.savedNpc.findUnique({
    where: { id },
    include: { campaign: true },
  });
  if (!npc || npc.campaign.userId !== userId) return null;
  return npc;
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

  // If affiliationId is being changed, verify it belongs to the same campaign
  if (d.affiliationId !== undefined && d.affiliationId !== null) {
    const aff = await prisma.npcAffiliation.findUnique({ where: { id: d.affiliationId } });
    if (!aff || aff.campaignId !== existing.campaignId) {
      return NextResponse.json({ error: "Affiliation not found" }, { status: 404 });
    }
  }

  const updated = await prisma.savedNpc.update({
    where: { id },
    data: {
      ...(d.name !== undefined && { name: d.name }),
      ...(d.gender !== undefined && { gender: d.gender }),
      ...(d.age !== undefined && { age: d.age }),
      ...(d.type !== undefined && { type: d.type }),
      ...(d.typeLabel !== undefined && { typeLabel: d.typeLabel }),
      ...(d.secondaryType !== undefined && { secondaryType: d.secondaryType }),
      ...(d.secondaryTypeLabel !== undefined && { secondaryTypeLabel: d.secondaryTypeLabel }),
      ...(d.physical !== undefined && { physicalJson: JSON.stringify(d.physical) }),
      ...(d.personality !== undefined && { personalityJson: JSON.stringify(d.personality) }),
      ...(d.details !== undefined && { detailsJson: JSON.stringify(d.details) }),
      ...(d.affiliationId !== undefined && { affiliationId: d.affiliationId }),
      ...(d.isDeceased !== undefined && { isDeceased: d.isDeceased }),
      ...(d.isPinned !== undefined && { isPinned: d.isPinned }),
      ...(d.notes !== undefined && { notes: d.notes }),
      ...(d.isCombatant !== undefined && { isCombatant: d.isCombatant }),
      ...(d.combatAc !== undefined && { combatAc: d.combatAc }),
      ...(d.combatHd !== undefined && { combatHd: d.combatHd }),
      ...(d.combatMaxHp !== undefined && { combatMaxHp: d.combatMaxHp }),
      ...(d.combatAttackBonus !== undefined && { combatAttackBonus: d.combatAttackBonus }),
      ...(d.combatAttackDamage !== undefined && { combatAttackDamage: d.combatAttackDamage }),
    },
  });

  return NextResponse.json(normalize(updated));
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await getForUser(id, userId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.savedNpc.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
