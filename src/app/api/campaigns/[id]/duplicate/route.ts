import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import {
  campaignTransferInclude,
  createCampaignFromData,
  serializeCampaign,
} from "@/lib/campaign-transfer";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const source = await prisma.campaign.findUnique({
    where: { id },
    include: campaignTransferInclude,
  });

  if (!source || source.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const payload = serializeCampaign(source);

  const created = await prisma.$transaction(
    (tx) =>
      createCampaignFromData(tx, userId, payload, {
        nameOverride: `${source.name} (copy)`,
      }),
    { timeout: 30000 }
  );

  const result = await prisma.campaign.findUnique({
    where: { id: created.id },
    include: { state: { include: { currentRegion: true } } },
  });

  return NextResponse.json(result, { status: 201 });
}
