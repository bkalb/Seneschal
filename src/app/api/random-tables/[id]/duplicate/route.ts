import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { tableInclude, tableIncludeWithCampaign } from "@/lib/tables/shape-table";

/**
 * POST /api/random-tables/[id]/duplicate
 *
 * Deep-copies one table (rows + modifiers + region joins) within the same
 * campaign. The field list mirrors the `randomTables` block in
 * `campaign-transfer.ts` `createCampaignFromData` so nothing is dropped.
 * Stateful/forecast fields (lastResult, lastModifiedResult, forecastResult,
 * forecastModifiedResult, forecastDate, forecastOutcome) are reset to null
 * on the copy since they default to null on `create` and are never set here.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const source = await prisma.randomTable.findUnique({
    where: { id },
    include: tableIncludeWithCampaign,
  });

  if (!source || source.campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const maxOrder = await prisma.randomTable.aggregate({
    where: { campaignId: source.campaignId },
    _max: { sortOrder: true },
  });

  const duplicated = await prisma.$transaction(async (tx) => {
    const newTable = await tx.randomTable.create({
      data: {
        campaignId: source.campaignId,
        name: `${source.name} (copy)`,
        category: source.category,
        diceExpression: source.diceExpression,
        isStateful: source.isStateful,
        rollOnDayAdvance: source.rollOnDayAdvance,
        seasonName: source.seasonName,
        rollWhenNoSeason: source.rollWhenNoSeason,
        manualModifier: source.manualModifier,
        surpriseDice: source.surpriseDice,
        surpriseThreshold: source.surpriseThreshold,
        applicableModes: source.applicableModes,
        npcForType: source.npcForType,
        npcForGender: source.npcForGender,
        prerequisiteDice: source.prerequisiteDice,
        prerequisiteMin: source.prerequisiteMin,
        prerequisiteMax: source.prerequisiteMax,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
        // Stateful/forecast fields intentionally omitted — default to null on create.
        rows: {
          create: source.rows.map((r) => ({ min: r.min, max: r.max, outcome: r.outcome })),
        },
        regions: {
          create: source.regions.map((r) => ({ regionId: r.regionId })),
        },
      },
    });

    for (const m of source.modifiers) {
      await tx.tableModifier.create({
        data: {
          tableId: newTable.id,
          label: m.label,
          behavior: m.behavior,
          rollAdjustment: m.rollAdjustment,
          extraConfig: m.extraConfig,
          autoRegions: { connect: m.autoRegions.map((r) => ({ id: r.id })) },
          conditionalRegions: { connect: m.conditionalRegions.map((r) => ({ id: r.id })) },
        },
      });
    }

    return tx.randomTable.findUniqueOrThrow({
      where: { id: newTable.id },
      include: tableInclude,
    });
  });

  return NextResponse.json(normalizeTable(duplicated), { status: 201 });
}

// Shape the Prisma result into the RandomTable type used client-side.
// Mirrors the normalizer in ../route.ts and ../[id]/route.ts.
function normalizeTable(table: any) {
  return {
    ...table,
    seasonName: table.seasonName ?? null,
    rollWhenNoSeason: table.rollWhenNoSeason ?? "always",
    manualModifier: table.manualModifier ?? 0,
    surpriseDice: table.surpriseDice ?? null,
    surpriseThreshold: table.surpriseThreshold ?? null,
    npcForType: table.npcForType ?? null,
    npcForGender: table.npcForGender ?? null,
    prerequisiteDice: table.prerequisiteDice ?? null,
    prerequisiteMin: table.prerequisiteMin ?? null,
    prerequisiteMax: table.prerequisiteMax ?? null,
    lastModifiedResult: table.lastModifiedResult ?? null,
    regionIds: table.regions.map((r: any) => r.regionId),
    modifiers: table.modifiers.map((m: any) => ({
      ...m,
      extraConfig: m.extraConfig ? JSON.parse(m.extraConfig) : null,
      autoRegionIds: m.autoRegions.map((r: any) => r.id),
      conditionalRegionIds: m.conditionalRegions.map((r: any) => r.id),
    })),
  };
}
