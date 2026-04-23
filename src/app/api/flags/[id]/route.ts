import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

const patchSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  color: z.string().optional(),
  counter: z.number().int().nullable().optional(),
  countDirection: z.enum(["up", "down"]).nullable().optional(),
  paused: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

async function getFlag(id: string, userId: string) {
  const flag = await prisma.campaignFlag.findUnique({
    where: { id },
    include: { campaign: { select: { userId: true } } },
  });
  if (!flag || flag.campaign.userId !== userId) return null;
  return flag;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const flag = await getFlag(id, userId);
  if (!flag) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.campaignFlag.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const flag = await getFlag(id, userId);
  if (!flag) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.campaignFlag.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
