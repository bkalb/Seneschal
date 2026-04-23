import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  rerollOnSwitch: z.boolean().optional(),
  regionType: z.enum(["OVERLAND", "DUNGEON", "BOTH"]).optional(),
});

async function ownsRegion(userId: string, regionId: string) {
  const region = await prisma.region.findUnique({
    where: { id: regionId },
    include: { campaign: true },
  });
  return region?.campaign.userId === userId ? region : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await ownsRegion(userId, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, rerollOnSwitch, regionType } = parsed.data;
  const updated = await prisma.region.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(rerollOnSwitch !== undefined && { rerollOnSwitch }),
      ...(regionType !== undefined && { regionType }),
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
  if (!(await ownsRegion(userId, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.region.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
