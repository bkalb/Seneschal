import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { rollOnTable } from "@/lib/tables/engine";
import { singularize } from "@/lib/singularize";
import type { RandomTable } from "@/types/table";

const createSchema = z.object({
  encounterId: z.string(),
  name: z.string().min(1),
  count: z.number().int().min(1).max(100),
  ac: z.number().int(),
  hd: z.string().min(1),
  maxHp: z.number().int().min(1).optional(),
  // Per-combatant rolled HP values; when provided, takes precedence over maxHp.
  maxHps: z.array(z.number().int().min(1)).optional(),
  attackCount: z.number().int().min(1).default(1),
  attackBonus: z.number().int(),
  attackDamage: z.string().min(1),
  // Optional humanoid trait rolling
  traitTableId: z.string().optional(),
  traitCount: z.number().int().min(1).max(10).optional(),
}).refine((d) => d.maxHp != null || (d.maxHps != null && d.maxHps.length > 0), {
  message: "Either maxHp or maxHps must be provided",
});

const tableInclude = {
  rows: { orderBy: { min: "asc" as const } },
  modifiers: { include: { autoRegions: true, conditionalRegions: true } },
  regions: { include: { region: true } },
} as const;

function shapeTable(table: any): RandomTable {
  return {
    ...table,
    regionIds: table.regions.map((r: any) => r.regionId),
    modifiers: table.modifiers.map((m: any) => ({
      ...m,
      extraConfig: m.extraConfig ? JSON.parse(m.extraConfig) : null,
      autoRegionIds: m.autoRegions.map((r: any) => r.id),
      conditionalRegionIds: m.conditionalRegions.map((r: any) => r.id),
    })),
  };
}

function rollTraits(table: RandomTable, count: number): string {
  const rolled = Array.from({ length: count }, () =>
    rollOnTable(table, null, []).resolvedOutcome.expandedText
  );
  return rolled.join(", ");
}

export async function POST(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { encounterId, name, count, ac, hd, maxHp, maxHps, attackCount, attackBonus, attackDamage, traitTableId, traitCount } = parsed.data;

  const encounter = await prisma.combatEncounter.findUnique({
    where: { id: encounterId },
    include: { campaign: true },
  });
  if (!encounter || encounter.campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch and validate the trait table if requested
  let traitTable: RandomTable | null = null;
  if (traitTableId && traitCount) {
    const raw = await prisma.randomTable.findUnique({
      where: { id: traitTableId },
      include: tableInclude,
    });
    if (!raw || raw.campaignId !== encounter.campaignId) {
      return NextResponse.json({ error: "Trait table not found" }, { status: 404 });
    }
    traitTable = shapeTable(raw);
  }

  const existingSideCount = await prisma.combatSide.count({ where: { encounterId } });

  const side = await prisma.combatSide.create({
    data: {
      encounterId,
      name,
      sortOrder: existingSideCount,
      combatants: {
        create: Array.from({ length: count }, (_, i) => {
          const hp = maxHps ? (maxHps[i] ?? maxHps[0]) : maxHp!;
          const notes = traitTable && traitCount
            ? rollTraits(traitTable, traitCount)
            : null;
          return {
            name: count === 1 ? name : `${singularize(name)} ${i + 1}`,
            sortOrder: i,
            ac,
            hd,
            maxHp: hp,
            currentHp: hp,
            attackCount,
            attackBonus,
            attackDamage,
            notes,
          };
        }),
      },
    },
    include: { combatants: { orderBy: { sortOrder: "asc" } } },
  });

  return NextResponse.json(side, { status: 201 });
}
