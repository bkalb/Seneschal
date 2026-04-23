import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

const TABLE_CATEGORIES = ["NPC", "ENCOUNTER", "CALENDAR", "REACTION", "MORALE", "GENERAL"] as const;

const createSchema = z.object({
  campaignId: z.string(),
  name: z.string().min(1).max(200),
  category: z.enum(TABLE_CATEGORIES),
  diceExpression: z.string().min(1),
  isStateful: z.boolean().default(false),
  rollOnDayAdvance: z.boolean().default(false),
  rows: z.array(z.object({ min: z.number().int(), max: z.number().int(), outcome: z.string() })),
  modifiers: z.array(z.object({
    label: z.string(),
    behavior: z.enum(["ALWAYS", "AUTO_REGION", "CONDITIONAL_REGION"]),
    rollAdjustment: z.number().int().default(0),
    extraConfig: z.string().nullable().optional(),
    autoRegionIds: z.array(z.string()).default([]),
    conditionalRegionIds: z.array(z.string()).default([]),
  })).default([]),
  regionIds: z.array(z.string()).default([]),
  surpriseDice: z.string().nullable().optional(),
  surpriseThreshold: z.number().int().nullable().optional(),
  npcForType: z.string().nullable().optional(),
  npcForGender: z.string().nullable().optional(),
});

export async function GET(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaignId = request.nextUrl.searchParams.get("campaignId");
  const category = request.nextUrl.searchParams.get("category");
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tables = await prisma.randomTable.findMany({
    where: {
      campaignId,
      ...(category ? { category } : {}),
    },
    orderBy: { sortOrder: "asc" },
    include: {
      rows: { orderBy: { min: "asc" } },
      modifiers: { include: { autoRegions: true, conditionalRegions: true } },
      regions: { include: { region: true } },
    },
  });

  return NextResponse.json(tables.map(normalizeTable));
}

export async function POST(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: parsed.data.campaignId } });
  if (!campaign || campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const maxOrder = await prisma.randomTable.aggregate({
    where: { campaignId: parsed.data.campaignId },
    _max: { sortOrder: true },
  });

  const { rows, modifiers, regionIds, ...tableData } = parsed.data;

  const table = await prisma.randomTable.create({
    data: {
      ...tableData,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      rows: { create: rows },
      regions: { create: regionIds.map((regionId) => ({ regionId })) },
      modifiers: {
        create: modifiers.map(({ autoRegionIds, conditionalRegionIds, ...mod }) => ({
          ...mod,
          autoRegions: { connect: autoRegionIds.map((id) => ({ id })) },
          conditionalRegions: { connect: conditionalRegionIds.map((id) => ({ id })) },
        })),
      },
    },
    include: {
      rows: { orderBy: { min: "asc" } },
      modifiers: { include: { autoRegions: true, conditionalRegions: true } },
      regions: { include: { region: true } },
    },
  });

  return NextResponse.json(normalizeTable(table), { status: 201 });
}

// Shape the Prisma result into the RandomTable type used client-side
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
