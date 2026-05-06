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
        dungeonConfig: true,
        lightSourceTypes: { orderBy: { sortOrder: "asc" } },
      },
    });

    if (!campaign || campaign.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const tableIdToName = new Map<string, string>(
      campaign.randomTables.map((t) => [t.id, t.name])
    );

    const regionIdToName = new Map<string, string>(
      campaign.regions.map((r) => [r.id, r.name])
    );

    const defaultReactionTableName = campaign.defaultReactionTableId
      ? (tableIdToName.get(campaign.defaultReactionTableId) ?? null)
      : null;

    const defaultMoraleTableName = campaign.defaultMoraleTableId
      ? (tableIdToName.get(campaign.defaultMoraleTableId) ?? null)
      : null;

    const defaultTraitTableName = campaign.defaultTraitTableId
      ? (tableIdToName.get(campaign.defaultTraitTableId) ?? null)
      : null;

    const exported = {
      version: 2,
      exportedAt: new Date().toISOString(),
      campaign: {
        name: campaign.name,
        defaultSurpriseDice: campaign.defaultSurpriseDice,
        defaultSurpriseThreshold: campaign.defaultSurpriseThreshold,
        defaultReactionTableName,
        defaultMoraleTableName,
        encounterWindowsJson: campaign.encounterWindowsJson,
        defaultCombatAC: campaign.defaultCombatAC,
        defaultCombatHD: campaign.defaultCombatHD,
        defaultCombatAttackBonus: campaign.defaultCombatAttackBonus,
        defaultCombatAttackDamage: campaign.defaultCombatAttackDamage,
        defaultRollHpIndividually: campaign.defaultRollHpIndividually,
        defaultTraitTableName,
        defaultTraitCount: campaign.defaultTraitCount,
        state: {
          currentDate: campaign.state?.currentDate ?? "0001-01-01",
          mode: campaign.state?.mode ?? "OVERLAND",
          currentTime: campaign.state?.currentTime ?? "12:00 PM",
          forecastingMode: campaign.state?.forecastingMode ?? false,
          currentRegionName: campaign.state?.currentRegionId
            ? (regionIdToName.get(campaign.state.currentRegionId) ?? null)
            : null,
          currentDungeonRegionName: campaign.state?.currentDungeonRegionId
            ? (regionIdToName.get(campaign.state.currentDungeonRegionId) ?? null)
            : null,
        },
        regions: campaign.regions.map((r) => ({
          name: r.name,
          rerollOnSwitch: r.rerollOnSwitch,
          regionType: r.regionType,
        })),
        rulesSections: campaign.rulesSections.map((s) => ({
          title: s.title,
          content: s.content,
          sortOrder: s.sortOrder,
          applicableModes: s.applicableModes,
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
          applicableModes: t.applicableModes,
          npcForType: t.npcForType,
          npcForGender: t.npcForGender,
          prerequisiteDice: t.prerequisiteDice,
          prerequisiteMin: t.prerequisiteMin,
          prerequisiteMax: t.prerequisiteMax,
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
          let cfg: any = null;
          try {
            const parsed = JSON.parse(p.stepsJson);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) cfg = parsed;
          } catch { /* ignore */ }

          const idToName = (id: string | null | undefined) =>
            id ? (tableIdToName.get(id) ?? null) : null;

          return {
            name: p.name,
            sortOrder: p.sortOrder,
            typeLabel: cfg?.typeLabel ?? "Type",
            secondaryTypeLabel: cfg?.secondaryTypeLabel ?? null,
            typeTableName: idToName(cfg?.typeTableId),
            secondaryTypeTableName: idToName(cfg?.secondaryTypeTableId),
            ageTableName: idToName(cfg?.ageTableId),
            physicalTableNames: (cfg?.physicalTableIds ?? []).map((id: string) => tableIdToName.get(id) ?? id),
            personalityTableNames: (cfg?.personalityTableIds ?? []).map((id: string) => tableIdToName.get(id) ?? id),
            detailTableNames: (cfg?.detailTableIds ?? []).map(({ label, tableId }: { label: string; tableId: string }) => ({
              label,
              tableName: tableIdToName.get(tableId) ?? tableId,
            })),
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
        dungeonConfig: campaign.dungeonConfig
          ? {
              turnsPerHour: campaign.dungeonConfig.turnsPerHour,
              encounterTurnsJson: campaign.dungeonConfig.encounterTurnsJson,
            }
          : null,
        lightSourceTypes: campaign.lightSourceTypes.map((ls) => ({
          name: ls.name,
          defaultDuration: ls.defaultDuration,
          sortOrder: ls.sortOrder,
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
  } catch (err) {
    console.error("[export] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
