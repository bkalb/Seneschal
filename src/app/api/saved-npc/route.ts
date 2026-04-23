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

const createSchema = z.object({
  campaignId: z.string(),
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
  affiliationId: z.string().nullable().optional(),
  isCombatant: z.boolean().optional(),
  combatAc: z.number().int().nullable().optional(),
  combatHd: z.string().nullable().optional(),
  combatMaxHp: z.number().int().nullable().optional(),
  combatAttackBonus: z.number().int().nullable().optional(),
  combatAttackDamage: z.string().nullable().optional(),
});

export async function GET(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const p = request.nextUrl.searchParams;
  const campaignId = p.get("campaignId");
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const search = p.get("search") ?? undefined;
  const affiliationId = p.get("affiliationId") ?? undefined;
  const status = p.get("status") ?? "all"; // "all" | "alive" | "deceased"
  const sortBy = p.get("sortBy") ?? "createdAt"; // "name" | "type" | "createdAt"
  const sortDir = p.get("sortDir") === "desc" ? "desc" : "asc";
  const combatantOnly = p.get("combatant") === "true";

  const where = {
    campaignId,
    ...(affiliationId ? { affiliationId } : {}),
    ...(combatantOnly ? { isCombatant: true } : {}),
    ...(status === "alive" ? { isDeceased: false } : status === "deceased" ? { isDeceased: true } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { type: { contains: search } },
            { secondaryType: { contains: search } },
          ],
        }
      : {}),
  };

  const orderBy =
    sortBy === "name"
      ? { name: sortDir as "asc" | "desc" }
      : sortBy === "type"
        ? { type: sortDir as "asc" | "desc" }
        : { createdAt: sortDir as "asc" | "desc" };

  const npcs = await prisma.savedNpc.findMany({
    where,
    orderBy: [{ isPinned: "desc" }, orderBy],
  });

  return NextResponse.json(npcs.map(normalize));
}

export async function POST(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { campaignId, physical, personality, details, affiliationId, isCombatant, combatAc, combatHd, combatMaxHp, combatAttackBonus, combatAttackDamage, ...rest } = parsed.data;

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (affiliationId) {
    const aff = await prisma.npcAffiliation.findUnique({ where: { id: affiliationId } });
    if (!aff || aff.campaignId !== campaignId) {
      return NextResponse.json({ error: "Affiliation not found" }, { status: 404 });
    }
  }

  const npc = await prisma.savedNpc.create({
    data: {
      campaignId,
      affiliationId: affiliationId ?? null,
      name: rest.name ?? null,
      gender: rest.gender,
      age: rest.age ?? null,
      type: rest.type ?? null,
      typeLabel: rest.typeLabel,
      secondaryType: rest.secondaryType ?? null,
      secondaryTypeLabel: rest.secondaryTypeLabel ?? null,
      physicalJson: JSON.stringify(physical),
      personalityJson: JSON.stringify(personality),
      detailsJson: JSON.stringify(details),
      isCombatant: isCombatant ?? false,
      combatAc: combatAc ?? null,
      combatHd: combatHd ?? null,
      combatMaxHp: combatMaxHp ?? null,
      combatAttackBonus: combatAttackBonus ?? null,
      combatAttackDamage: combatAttackDamage ?? null,
    },
  });

  return NextResponse.json(normalize(npc), { status: 201 });
}
