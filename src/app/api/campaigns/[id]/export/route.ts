/**
 * GET /api/campaigns/[id]/export
 *
 * Returns a versioned JSON snapshot of the full campaign.
 * All internal DB IDs are replaced with stable human-readable names so the
 * file can be imported into any instance of the app.
 *
 * Cross-references replaced with names:
 *   - Campaign.defaultReactionTableId → defaultReactionTableName
 *   - RandomTable.regionIds → regionNames[]
 *   - TableModifier.autoRegions/conditionalRegions → autoRegionNames[]/conditionalRegionNames[]
 *   - NpcProfile step.tableId / branch.tableId → tableName
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      state: true,
      regions: true,
      rulesSections: { orderBy: { sortOrder: "asc" } },
      randomTables: {
        orderBy: { sortOrder: "asc" },
        include: {
          rows: { orderBy: { min: "asc" } },
          modifiers: { include: { autoRegions: true, conditionalRegions: true } },
          regions: { include: { region: true } },
        },
      },
      npcProfiles: { orderBy: { sortOrder: "asc" } },
      calendarConfig: { include: { moons: true } },
      calendarNotes: { orderBy: { date: "asc" } },
      flags: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!campaign || campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Build id→name map for tables (used for NPC profile step resolution)
  const tableIdToName = new Map<string, string>(
    campaign.randomTables.map((t) => [t.id, t.name])
  );

  // Resolve defaultReactionTableId to a name
  const defaultReactionTableName = campaign.defaultReactionTableId
    ? (tableIdToName.get(campaign.defaultReactionTableId) ?? null)
    : null;

  const exported = {
    version: 1,
    exportedAt: new Date().toISOString(),
    campaign: {
      name: campaign.name,
      defaultSurpriseDice: campaign.defaultSurpriseDice,
      defaultSurpriseThreshold: campaign.defaultSurpriseThreshold,
      defaultReactionTableName,
      encounterWindowsJson: campaign.encounterWindowsJson,
      state: {
        currentDate: campaign.state?.currentDate ?? "0001-01-01",
      },
      regions: campaign.regions.map((r) => ({
        name: r.name,
        rerollOnSwitch: r.rerollOnSwitch,
      })),
      rulesSections: campaign.rulesSections.map((s) => ({
        title: s.title,
        content: s.content,
        sortOrder: s.sortOrder,
      })),
      randomTables: campaign.randomTables.map((t) => ({
        name: t.name,
        category: t.category,
        diceExpression: t.diceExpression,
        isStateful: t.isStateful,
        rollOnDayAdvance: t.rollOnDayAdvance,
        seasonName: t.seasonName,
        rollWhenNoSeason: t.rollWhenNoSeason,
        manualModifier: t.manualModifier,
        surpriseDice: t.surpriseDice,
        surpriseThreshold: t.surpriseThreshold,
        sortOrder: t.sortOrder,
        rows: t.rows.map((r) => ({ min: r.min, max: r.max, outcome: r.outcome })),
        regionNames: t.regions.map((tr) => tr.region.name),
        modifiers: t.modifiers.map((m) => ({
          label: m.label,
          behavior: m.behavior,
          rollAdjustment: m.rollAdjustment,
          extraConfig: m.extraConfig,
          autoRegionNames: m.autoRegions.map((r) => r.name),
          conditionalRegionNames: m.conditionalRegions.map((r) => r.name),
        })),
      })),
      npcProfiles: campaign.npcProfiles.map((p) => {
        const steps: any[] = JSON.parse(p.stepsJson);
        // Replace tableId with tableName in each step and branch
        const resolvedSteps = steps.map((step: any) => ({
          ...step,
          tableName: step.tableId ? (tableIdToName.get(step.tableId) ?? step.tableId) : "",
          tableId: undefined,
          branches: (step.branches ?? []).map((b: any) => ({
            ...b,
            tableName: b.tableId ? (tableIdToName.get(b.tableId) ?? b.tableId) : "",
            tableId: undefined,
          })),
        }));
        return {
          name: p.name,
          sortOrder: p.sortOrder,
          steps: resolvedSteps,
        };
      }),
      calendarConfig: campaign.calendarConfig
        ? {
            monthsJson: campaign.calendarConfig.monthsJson,
            weekdaysJson: campaign.calendarConfig.weekdaysJson,
            seasonsJson: campaign.calendarConfig.seasonsJson,
            intercalaryJson: campaign.calendarConfig.intercalaryJson,
            epochDate: campaign.calendarConfig.epochDate,
            moons: campaign.calendarConfig.moons.map((m) => ({
              name: m.name,
              cycleLength: m.cycleLength,
              referenceNewMoon: m.referenceNewMoon,
            })),
          }
        : null,
      calendarNotes: campaign.calendarNotes.map((n) => ({
        date: n.date,
        content: n.content,
      })),
      flags: campaign.flags.map((f) => ({
        label: f.label,
        color: f.color,
        counter: f.counter,
        countDirection: f.countDirection,
        paused: f.paused,
        sortOrder: f.sortOrder,
      })),
    },
  };

  const filename = `${campaign.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_export.json`;

  return new NextResponse(JSON.stringify(exported, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
