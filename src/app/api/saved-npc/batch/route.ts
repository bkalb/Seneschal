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

const npcEntrySchema = z.object({
  name: z.string().nullable().optional(),
  gender: z.enum(["male", "female"]),
  age: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  typeLabel: z.string(),
  secondaryType: z.string().nullable().optional(),
  secondaryTypeLabel: z.string().nullable().optional(),
  physical: z.array(z.string()).default([]),
  personality: z.array(z.string()).default([]),
  details: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
});

const batchSchema = z.object({
  campaignId: z.string(),
  // If provided, all saved NPCs are grouped under this affiliation name.
  // An existing affiliation with this name is reused; otherwise one is created.
  affiliationName: z.string().min(1).max(100).optional(),
  npcs: z.array(npcEntrySchema).min(1),
});

export async function POST(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { campaignId, affiliationName, npcs } = parsed.data;

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Resolve or create affiliation
  let affiliationId: string | null = null;
  if (affiliationName) {
    let aff = await prisma.npcAffiliation.findFirst({
      where: { campaignId, name: affiliationName },
    });
    if (!aff) {
      aff = await prisma.npcAffiliation.create({
        data: { campaignId, name: affiliationName },
      });
    }
    affiliationId = aff.id;
  }

  const created = await prisma.$transaction(
    npcs.map((npc) =>
      prisma.savedNpc.create({
        data: {
          campaignId,
          affiliationId,
          name: npc.name ?? null,
          gender: npc.gender,
          age: npc.age ?? null,
          type: npc.type ?? null,
          typeLabel: npc.typeLabel,
          secondaryType: npc.secondaryType ?? null,
          secondaryTypeLabel: npc.secondaryTypeLabel ?? null,
          physicalJson: JSON.stringify(npc.physical),
          personalityJson: JSON.stringify(npc.personality),
          detailsJson: JSON.stringify(npc.details),
        },
      })
    )
  );

  return NextResponse.json(created.map(normalize), { status: 201 });
}
