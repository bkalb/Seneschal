import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

const TABLE_CATEGORIES = ["NPC", "ENCOUNTER", "CALENDAR", "REACTION", "MORALE", "GENERAL"] as const;

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.enum(TABLE_CATEGORIES).optional(),
  diceExpression: z.string().min(1).optional(),
  isStateful: z.boolean().optional(),
  rollOnDayAdvance: z.boolean().optional(),
  seasonName: z.string().nullable().optional(),
  rollWhenNoSeason: z.enum(["always", "skip"]).optional(),
  manualModifier: z.number().int().optional(),
  surpriseDice: z.string().nullable().optional(),
  surpriseThreshold: z.number().int().nullable().optional(),
  npcForType: z.string().nullable().optional(),
  npcForGender: z.string().nullable().optional(),
  applicableModes: z.enum(["BOTH", "OVERLAND", "DUNGEON"]).optional(),
  prerequisiteDice: z.string().nullable().optional(),
  prerequisiteMin: z.number().int().nullable().optional(),
  prerequisiteMax: z.number().int().nullable().optional(),
  sortOrder: z.number().int().optional(),
  rows: z.array(z.object({ min: z.number().int(), max: z.number().int(), outcome: z.string() })).optional(),
  modifiers: z.array(z.object({
    label: z.string(),
    behavior: z.enum(["ALWAYS", "AUTO_REGION", "CONDITIONAL_REGION", "PREV_RESULT_CONDITION"]),
    rollAdjustment: z.number().int().default(0),
    extraConfig: z.string().nullable().optional(),
    autoRegionIds: z.array(z.string()).default([]),
    conditionalRegionIds: z.array(z.string()).default([]),
  })).optional(),
  regionIds: z.array(z.string()).optional(),
});

async function getTableForUser(id: string, userId: string) {
  const table = await prisma.randomTable.findUnique({
    where: { id },
    include: { campaign: true },
  });
  if (!table || table.campaign.userId !== userId) return null;
  return table;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const table = await prisma.randomTable.findUnique({
    where: { id },
    include: {
      campaign: true,
      rows: { orderBy: { min: "asc" } },
      modifiers: { include: { autoRegions: true, conditionalRegions: true } },
      regions: { include: { region: true } },
    },
  });

  if (!table || table.campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(normalizeTable(table));
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await getTableForUser(id, userId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { rows, modifiers, regionIds, ...tableData } = parsed.data;

  let updated;
  try {
    updated = await prisma.randomTable.update({
      where: { id },
      data: {
        ...tableData,
        ...(rows !== undefined && {
          rows: {
            deleteMany: {},
            create: rows,
          },
        }),
        ...(modifiers !== undefined && {
          modifiers: {
            deleteMany: {},
            create: modifiers.map(({ autoRegionIds, conditionalRegionIds, extraConfig, ...mod }) => ({
              ...mod,
              extraConfig: extraConfig != null
                ? (typeof extraConfig === "string" ? extraConfig : JSON.stringify(extraConfig))
                : null,
              autoRegions: { connect: autoRegionIds.map((rid) => ({ id: rid })) },
              conditionalRegions: { connect: conditionalRegionIds.map((rid) => ({ id: rid })) },
            })),
          },
        }),
        ...(regionIds !== undefined && {
          regions: {
            deleteMany: {},
            create: regionIds.map((regionId) => ({ regionId })),
          },
        }),
      },
      include: {
        rows: { orderBy: { min: "asc" } },
        modifiers: { include: { autoRegions: true, conditionalRegions: true } },
        regions: { include: { region: true } },
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json(normalizeTable(updated));
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await getTableForUser(id, userId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.randomTable.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

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
