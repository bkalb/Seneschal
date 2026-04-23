import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { rollOnTable } from "@/lib/tables/engine";
import { rollExpression } from "@/lib/dice/roller";
import { detectAndResolveSubRolls } from "@/lib/tables/sub-roll";
import type { ReactionResult, SurpriseResult } from "@/types/table";

const rollSchema = z.object({
  currentRegionId: z.string().nullable().optional(),
  userToggles: z.array(z.string()).default([]),
});

const tableInclude = {
  campaign: true,
  rows: { orderBy: { min: "asc" as const } },
  modifiers: { include: { autoRegions: true, conditionalRegions: true } },
  regions: { include: { region: true } },
} as const;

function shapeTable(table: any) {
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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const table = await prisma.randomTable.findUnique({
    where: { id },
    include: tableInclude,
  });

  if (!table || table.campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = rollSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { currentRegionId = null, userToggles } = parsed.data;

  const result = rollOnTable(
    shapeTable(table) as unknown as import("@/types/table").RandomTable,
    currentRegionId ?? null,
    userToggles,
  );

  // Persist lastResult for stateful tables
  if (table.isStateful) {
    await prisma.randomTable.update({
      where: { id },
      data: { lastResult: result.rawDiceTotal },
    });
  }

  // ── Reaction roll (ENCOUNTER tables only) ────────────────────────────────────
  // Prefer the campaign-level default reaction table; fall back to first REACTION table.
  let reaction: ReactionResult | null = null;
  if (table.category === "ENCOUNTER") {
    const campaign = table.campaign as unknown as { defaultReactionTableId: string | null };
    const reactionTable = campaign.defaultReactionTableId
      ? await prisma.randomTable.findUnique({
          where: { id: campaign.defaultReactionTableId },
          include: tableInclude,
        })
      : await prisma.randomTable.findFirst({
          where: { campaignId: table.campaignId, category: "REACTION" },
          include: tableInclude,
        });

    if (reactionTable) {
      const reactionResult = rollOnTable(
        shapeTable(reactionTable) as unknown as import("@/types/table").RandomTable,
        currentRegionId ?? null,
        [],
      );
      reaction = {
        tableName: reactionTable.name,
        roll: reactionResult.diceTotal,
        outcome: reactionResult.resolvedOutcome.expandedText,
      };
    }
  }

  // ── Surprise roll ────────────────────────────────────────────────────────────
  // Table-level surprise config takes precedence; fall back to campaign defaults.
  let surprise: SurpriseResult | null = null;
  if (table.category === "ENCOUNTER") {
    const campaign = table.campaign as unknown as {
      defaultSurpriseDice: string | null;
      defaultSurpriseThreshold: number | null;
    };
    const surpriseDice = table.surpriseDice ?? campaign.defaultSurpriseDice;
    const surpriseThreshold = table.surpriseThreshold ?? campaign.defaultSurpriseThreshold;
    if (surpriseDice && surpriseThreshold !== null && surpriseThreshold !== undefined) {
      const surpriseRoll = rollExpression(surpriseDice);
      surprise = {
        dice: surpriseDice,
        roll: surpriseRoll.total,
        threshold: surpriseThreshold,
        surprised: surpriseRoll.total <= surpriseThreshold,
      };
    }
  }

  // ── Sub-rolls (e.g. "roll a d20 for each side") ──────────────────────────────
  const subRolls = detectAndResolveSubRolls(
    result.resolvedOutcome.expandedText,
    table.rows as import("@/types/table").TableRow[],
  );

  return NextResponse.json({ ...result, reaction, surprise, subRolls: subRolls.length > 0 ? subRolls : undefined });
}
