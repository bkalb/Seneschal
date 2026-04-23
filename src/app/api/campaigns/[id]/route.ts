import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

const encounterWindowSchema = z.object({
  name: z.string().min(1),
  startHour: z.number().int().min(0).max(23),
  startMinute: z.number().int().min(0).max(59),
  endHour: z.number().int().min(0).max(23),
  endMinute: z.number().int().min(0).max(59),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  defaultSurpriseDice: z.string().nullable().optional(),
  defaultSurpriseThreshold: z.number().int().nullable().optional(),
  defaultReactionTableId: z.string().nullable().optional(),
  defaultMoraleTableId: z.string().nullable().optional(),
  encounterWindows: z.array(encounterWindowSchema).optional(),
  defaultCombatAC: z.number().int().nullable().optional(),
  defaultCombatHD: z.string().nullable().optional(),
  defaultCombatAttackBonus: z.number().int().nullable().optional(),
  defaultCombatAttackDamage: z.string().nullable().optional(),
  defaultRollHpIndividually: z.boolean().optional(),
  defaultTraitTableId: z.string().nullable().optional(),
  defaultTraitCount: z.number().int().min(1).max(10).nullable().optional(),
});

async function ownsCampaign(userId: string, campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  return campaign?.userId === userId ? campaign : null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const campaign = await ownsCampaign(userId, id);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const full = await prisma.campaign.findUnique({
    where: { id },
    include: { state: { include: { currentRegion: true } }, regions: true },
  });

  return NextResponse.json(full);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await ownsCampaign(userId, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, defaultSurpriseDice, defaultSurpriseThreshold, defaultReactionTableId, defaultMoraleTableId, encounterWindows, defaultCombatAC, defaultCombatHD, defaultCombatAttackBonus, defaultCombatAttackDamage, defaultRollHpIndividually, defaultTraitTableId, defaultTraitCount } = parsed.data;
  const updated = await prisma.campaign.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(defaultSurpriseDice !== undefined && { defaultSurpriseDice }),
      ...(defaultSurpriseThreshold !== undefined && { defaultSurpriseThreshold }),
      ...(defaultReactionTableId !== undefined && { defaultReactionTableId }),
      ...(defaultMoraleTableId !== undefined && { defaultMoraleTableId }),
      ...(encounterWindows !== undefined && { encounterWindowsJson: JSON.stringify(encounterWindows) }),
      ...(defaultCombatAC !== undefined && { defaultCombatAC }),
      ...(defaultCombatHD !== undefined && { defaultCombatHD }),
      ...(defaultCombatAttackBonus !== undefined && { defaultCombatAttackBonus }),
      ...(defaultCombatAttackDamage !== undefined && { defaultCombatAttackDamage }),
      ...(defaultRollHpIndividually !== undefined && { defaultRollHpIndividually }),
      ...(defaultTraitTableId !== undefined && { defaultTraitTableId }),
      ...(defaultTraitCount !== undefined && { defaultTraitCount }),
    },
    include: { state: { include: { currentRegion: true } } },
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
  if (!(await ownsCampaign(userId, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.campaign.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
