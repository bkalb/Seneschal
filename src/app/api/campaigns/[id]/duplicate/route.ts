import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const source = await prisma.campaign.findUnique({
    where: { id },
    include: {
      regions: true,
      rulesSections: { orderBy: { sortOrder: "asc" } },
      randomTables: {
        include: { rows: true, modifiers: { include: { autoRegions: true, conditionalRegions: true } }, regions: true },
      },
      calendarConfig: { include: { moons: true } },
      // notes are NOT duplicated (they represent past events for the source campaign)
    },
  });

  if (!source || source.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Build a mapping from old region IDs → new region IDs
  const regionIdMap = new Map<string, string>();

  const newCampaign = await prisma.campaign.create({
    data: {
      userId,
      name: `${source.name} (copy)`,
      state: { create: { currentDate: "0001-01-01" } },
    },
  });

  // Duplicate regions first (tables reference them)
  for (const region of source.regions) {
    const newRegion = await prisma.region.create({
      data: { campaignId: newCampaign.id, name: region.name },
    });
    regionIdMap.set(region.id, newRegion.id);
  }

  // Duplicate rules sections
  for (const section of source.rulesSections) {
    await prisma.rulesSection.create({
      data: {
        campaignId: newCampaign.id,
        title: section.title,
        content: section.content,
        sortOrder: section.sortOrder,
      },
    });
  }

  // Duplicate random tables
  for (const table of source.randomTables) {
    const newTable = await prisma.randomTable.create({
      data: {
        campaignId: newCampaign.id,
        name: table.name,
        diceExpression: table.diceExpression,
        isStateful: table.isStateful,
        rollOnDayAdvance: table.rollOnDayAdvance,
        sortOrder: table.sortOrder,
        rows: { create: table.rows.map((r) => ({ min: r.min, max: r.max, outcome: r.outcome })) },
      },
    });

    // Duplicate table-region associations
    for (const tr of table.regions) {
      const newRegionId = regionIdMap.get(tr.regionId);
      if (newRegionId) {
        await prisma.randomTableRegion.create({
          data: { tableId: newTable.id, regionId: newRegionId },
        });
      }
    }

    // Duplicate modifiers with their region associations
    for (const mod of table.modifiers) {
      await prisma.tableModifier.create({
        data: {
          tableId: newTable.id,
          label: mod.label,
          behavior: mod.behavior,
          rollAdjustment: mod.rollAdjustment,
          extraConfig: mod.extraConfig,
          autoRegions: {
            connect: mod.autoRegions
              .map((r) => regionIdMap.get(r.id))
              .filter(Boolean)
              .map((newId) => ({ id: newId! })),
          },
          conditionalRegions: {
            connect: mod.conditionalRegions
              .map((r) => regionIdMap.get(r.id))
              .filter(Boolean)
              .map((newId) => ({ id: newId! })),
          },
        },
      });
    }
  }

  // Duplicate calendar config (if it exists)
  if (source.calendarConfig) {
    const cc = source.calendarConfig;
    const newConfig = await prisma.calendarConfig.create({
      data: {
        campaignId: newCampaign.id,
        monthsJson: cc.monthsJson,
        weekdaysJson: cc.weekdaysJson,
        seasonsJson: cc.seasonsJson,
        intercalaryJson: cc.intercalaryJson,
        epochDate: cc.epochDate,
      },
    });
    for (const moon of cc.moons) {
      await prisma.moon.create({
        data: {
          configId: newConfig.id,
          name: moon.name,
          cycleLength: moon.cycleLength,
          referenceNewMoon: moon.referenceNewMoon,
        },
      });
    }
  }

  const result = await prisma.campaign.findUnique({
    where: { id: newCampaign.id },
    include: { state: { include: { currentRegion: true } } },
  });

  return NextResponse.json(result, { status: 201 });
}
