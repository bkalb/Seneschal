import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { npcProfileConfigSchema } from "@/lib/npc/schemas";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  config: npcProfileConfigSchema.optional(),
});

function normalize(p: { id: string; campaignId: string; name: string; stepsJson: string; sortOrder: number }) {
  let config;
  try {
    const parsed = JSON.parse(p.stepsJson);
    config = parsed && typeof parsed === "object" && !Array.isArray(parsed) && "typeLabel" in parsed
      ? parsed
      : { typeLabel: "Type", secondaryTypeLabel: null, typeTableId: null, secondaryTypeTableId: null, ageTableId: null, physicalTableIds: [], personalityTableIds: [], detailTableIds: [] };
  } catch {
    config = { typeLabel: "Type", secondaryTypeLabel: null, typeTableId: null, secondaryTypeTableId: null, ageTableId: null, physicalTableIds: [], personalityTableIds: [], detailTableIds: [] };
  }
  return { id: p.id, campaignId: p.campaignId, name: p.name, sortOrder: p.sortOrder, config };
}

async function getProfileForUser(id: string, userId: string) {
  const profile = await prisma.npcProfile.findUnique({
    where: { id },
    include: { campaign: true },
  });
  if (!profile || profile.campaign.userId !== userId) return null;
  return profile;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await getProfileForUser(id, userId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await prisma.npcProfile.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.config !== undefined && { stepsJson: JSON.stringify(parsed.data.config) }),
    },
  });

  return NextResponse.json(normalize(updated));
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await getProfileForUser(id, userId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.npcProfile.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
