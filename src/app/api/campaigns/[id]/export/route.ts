/**
 * GET /api/campaigns/[id]/export
 *
 * Returns a versioned JSON snapshot of the full campaign.
 * All internal DB IDs are replaced with stable human-readable names so the
 * file can be imported into any instance of the app.
 *
 * Cross-references replaced with names:
 *   - Campaign.defaultReactionTableId → defaultReactionTableName
 *   - Campaign.defaultMoraleTableId   → defaultMoraleTableName
 *   - Campaign.defaultTraitTableId    → defaultTraitTableName
 *   - CampaignState.currentRegionId        → currentRegionName
 *   - CampaignState.currentDungeonRegionId → currentDungeonRegionName
 *   - RandomTable.regionIds → regionNames[]
 *   - TableModifier.autoRegions/conditionalRegions → autoRegionNames[]/conditionalRegionNames[]
 *   - NpcProfile step.tableId / branch.tableId → tableName
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { campaignTransferInclude, serializeCampaign } from "@/lib/campaign-transfer";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireSession();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: campaignTransferInclude,
    });

    if (!campaign || campaign.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const exported = {
      version: 2,
      exportedAt: new Date().toISOString(),
      campaign: serializeCampaign(campaign),
    };

    const filename = `${campaign.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_export.json`;

    return new NextResponse(JSON.stringify(exported, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[export] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
