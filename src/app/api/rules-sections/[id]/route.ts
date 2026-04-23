import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  applicableModes: z.enum(["OVERLAND", "DUNGEON", "BOTH"]).optional(),
});

async function ownsSection(userId: string, sectionId: string) {
  const section = await prisma.rulesSection.findUnique({
    where: { id: sectionId },
    include: { campaign: true },
  });
  return section?.campaign.userId === userId ? section : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await ownsSection(userId, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.rulesSection.update({
    where: { id },
    data: parsed.data,
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
  if (!(await ownsSection(userId, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.rulesSection.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
