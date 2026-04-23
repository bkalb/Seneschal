import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

// Accepts an ordered array of section IDs and updates sortOrder to match.
const reorderSchema = z.object({
  campaignId: z.string(),
  orderedIds: z.array(z.string()),
});

export async function PATCH(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: parsed.data.campaignId } });
  if (!campaign || campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Update each section's sortOrder to match its position in the array
  await Promise.all(
    parsed.data.orderedIds.map((id, index) =>
      prisma.rulesSection.update({ where: { id }, data: { sortOrder: index } })
    )
  );

  return new NextResponse(null, { status: 204 });
}
