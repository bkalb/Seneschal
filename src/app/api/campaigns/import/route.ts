/**
 * POST /api/campaigns/import
 *
 * Accepts a campaign export JSON (produced by GET /api/campaigns/[id]/export)
 * and creates a new campaign owned by the requesting user.
 * All IDs are regenerated; internal cross-references are resolved by name.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

// ── Validation schema (permissive on unknown fields for forward compatibility) ──

const rowSchema = z.object({
  min: z.number().int(),
  max: z.number().int(),
  outcome: z.string(),
});

const modifierSchema = z.object({
  label: z.string(),
  behavior: z.string(),
  rollAdjustment: z.number().int().default(0),
  extraConfig: z.string().nullable().optional(),
  autoRegionNames: z.array(z.string()).default([]),
  conditionalRegionNames: z.array(z.string()).default([]),
});

const tableSchema = z.object({
  name: z.string(),
  category: z.string().default("ENCOUNTER"),
  diceExpression: z.string(),
  isStateful: z.boolean().default(false),
  rollOnDayAdvance: z.boolean().default(false),
  seasonName: z.string().nullable().optional(),
  rollWhenNoSeason: z.string().default("always"),
  manualModifier: z.number().int().default(0),
  surpriseDice: z.string().nullable().optional(),
  surpriseThreshold: z.number().int().nullable().optional(),
  sortOrder: z.number().int().default(0),
  applicableModes: z.string().default("BOTH"),
  npcForType: z.string().nullable().optional(),
  npcForGender: z.string().nullable().optional(),
  prerequisiteDice: z.string().nullable().optional(),
  prerequisiteMin: z.number().int().nullable().optional(),
  prerequisiteMax: z.number().int().nullable().optional(),
  rows: z.array(rowSchema).default([]),
  regionNames: z.array(z.string()).default([]),
  modifiers: z.array(modifierSchema).default([]),
});

const detailTableNameSchema = z.object({
  label: z.string(),
  tableName: z.string(),
});

const npcProfileSchema = z.object({
  name: z.string(),
  sortOrder: z.number().int().default(0),
  typeLabel: z.string().default("Type"),
  secondaryTypeLabel: z.string().nullable().default(null),
  typeTableName: z.string().nullable().optional(),
  secondaryTypeTableName: z.string().nullable().optional(),
  ageTableName: z.string().nullable().optional(),
  physicalTableNames: z.array(z.string()).default([]),
  personalityTableNames: z.array(z.string()).default([]),
  detailTableNames: z.array(detailTableNameSchema).default([]),
});

const moonSchema = z.object({
  name: z.string(),
  cycleLength: z.number().int(),
  referenceNewMoon: z.string(),
});

const calendarConfigSchema = z.object({
  monthsJson: z.string(),
  weekdaysJson: z.string(),
  seasonsJson: z.string(),
  intercalaryJson: z.string().nullable().optional(),
  epochDate: z.string().default("0001-01-01"),
  moons: z.array(moonSchema).default([]),
});

const noteSchema = z.object({
  date: z.string(),
  content: z.string(),
});

const flagSchema = z.object({
  label: z.string(),
  color: z.string().default("#fecdd3"),
  counter: z.number().int().nullable().optional(),
  countDirection: z.string().nullable().optional(),
  paused: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

const regionSchema = z.object({
  name: z.string(),
  rerollOnSwitch: z.boolean().default(false),
  regionType: z.string().default("OVERLAND"),
});

const rulesSectionSchema = z.object({
  title: z.string(),
  content: z.string(),
  sortOrder: z.number().int().default(0),
  applicableModes: z.string().default("BOTH"),
});

const dungeonConfigSchema = z.object({
  turnsPerHour: z.number().int().default(6),
  encounterTurnsJson: z.string().default("[2,5]"),
});

const lightSourceTypeSchema = z.object({
  name: z.string(),
  defaultDuration: z.number().int(),
  sortOrder: z.number().int().default(0),
});

const importSchema = z.object({
  version: z.number().int(),
  campaign: z.object({
    name: z.string(),
    defaultSurpriseDice: z.string().nullable().optional(),
    defaultSurpriseThreshold: z.number().int().nullable().optional(),
    defaultReactionTableName: z.string().nullable().optional(),
    defaultMoraleTableName: z.string().nullable().optional(),
    encounterWindowsJson: z.string().default("[]"),
    defaultCombatAC: z.number().int().nullable().optional(),
    defaultCombatHD: z.string().nullable().optional(),
    defaultCombatAttackBonus: z.number().int().nullable().optional(),
    defaultCombatAttackDamage: z.string().nullable().optional(),
    defaultRollHpIndividually: z.boolean().default(false),
    defaultTraitTableName: z.string().nullable().optional(),
    defaultTraitCount: z.number().int().nullable().optional(),
    state: z.object({
      currentDate: z.string().default("0001-01-01"),
      mode: z.string().default("OVERLAND"),
      currentTime: z.string().default("12:00 PM"),
      forecastingMode: z.boolean().default(false),
      currentRegionName: z.string().nullable().optional(),
      currentDungeonRegionName: z.string().nullable().optional(),
    }).optional(),
    regions: z.array(regionSchema).default([]),
    rulesSections: z.array(rulesSectionSchema).default([]),
    randomTables: z.array(tableSchema).default([]),
    npcProfiles: z.array(npcProfileSchema).default([]),
    calendarConfig: calendarConfigSchema.nullable().optional(),
    calendarNotes: z.array(noteSchema).default([]),
    flags: z.array(flagSchema).default([]),
    dungeonConfig: dungeonConfigSchema.nullable().optional(),
    lightSourceTypes: z.array(lightSourceTypeSchema).default([]),
  }),
});

export async function POST(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { campaign: src } = parsed.data;

  // ── Create the campaign shell ──────────────────────────────────────────────
  const newCampaign = await prisma.campaign.create({
    data: {
      userId,
      name: src.name,
      defaultSurpriseDice: src.defaultSurpriseDice ?? null,
      defaultSurpriseThreshold: src.defaultSurpriseThreshold ?? null,
      encounterWindowsJson: src.encounterWindowsJson,
      defaultCombatAC: src.defaultCombatAC ?? null,
      defaultCombatHD: src.defaultCombatHD ?? null,
      defaultCombatAttackBonus: src.defaultCombatAttackBonus ?? null,
      defaultCombatAttackDamage: src.defaultCombatAttackDamage ?? null,
      defaultRollHpIndividually: src.defaultRollHpIndividually,
      defaultTraitCount: src.defaultTraitCount ?? null,
      state: {
        create: {
          currentDate: src.state?.currentDate ?? "0001-01-01",
          mode: src.state?.mode ?? "OVERLAND",
          currentTime: src.state?.currentTime ?? "12:00 PM",
          forecastingMode: src.state?.forecastingMode ?? false,
        },
      },
    },
  });

  // ── Regions ────────────────────────────────────────────────────────────────
  const regionNameToId = new Map<string, string>();
  for (const r of src.regions) {
    const newRegion = await prisma.region.create({
      data: {
        campaignId: newCampaign.id,
        name: r.name,
        rerollOnSwitch: r.rerollOnSwitch,
        regionType: r.regionType,
      },
    });
    regionNameToId.set(r.name, newRegion.id);
  }

  // Restore current region references on state now that regions exist
  const currentRegionId = src.state?.currentRegionName
    ? (regionNameToId.get(src.state.currentRegionName) ?? null)
    : null;
  const currentDungeonRegionId = src.state?.currentDungeonRegionName
    ? (regionNameToId.get(src.state.currentDungeonRegionName) ?? null)
    : null;
  if (currentRegionId || currentDungeonRegionId) {
    await prisma.campaignState.update({
      where: { campaignId: newCampaign.id },
      data: {
        ...(currentRegionId ? { currentRegionId } : {}),
        ...(currentDungeonRegionId ? { currentDungeonRegionId } : {}),
      },
    });
  }

  // ── Rules sections ─────────────────────────────────────────────────────────
  for (const s of src.rulesSections) {
    await prisma.rulesSection.create({
      data: {
        campaignId: newCampaign.id,
        title: s.title,
        content: s.content,
        sortOrder: s.sortOrder,
        applicableModes: s.applicableModes,
      },
    });
  }

  // ── Random tables ──────────────────────────────────────────────────────────
  const tableNameToId = new Map<string, string>();

  for (const t of src.randomTables) {
    const newTable = await prisma.randomTable.create({
      data: {
        campaignId: newCampaign.id,
        name: t.name,
        category: t.category,
        diceExpression: t.diceExpression,
        isStateful: t.isStateful,
        rollOnDayAdvance: t.rollOnDayAdvance,
        seasonName: t.seasonName ?? null,
        rollWhenNoSeason: t.rollWhenNoSeason,
        manualModifier: t.manualModifier,
        surpriseDice: t.surpriseDice ?? null,
        surpriseThreshold: t.surpriseThreshold ?? null,
        sortOrder: t.sortOrder,
        applicableModes: t.applicableModes,
        npcForType: t.npcForType ?? null,
        npcForGender: t.npcForGender ?? null,
        prerequisiteDice: t.prerequisiteDice ?? null,
        prerequisiteMin: t.prerequisiteMin ?? null,
        prerequisiteMax: t.prerequisiteMax ?? null,
        rows: {
          create: t.rows.map((r) => ({ min: r.min, max: r.max, outcome: r.outcome })),
        },
      },
    });

    tableNameToId.set(t.name, newTable.id);

    // Region associations
    for (const regionName of t.regionNames) {
      const regionId = regionNameToId.get(regionName);
      if (regionId) {
        await prisma.randomTableRegion.create({
          data: { tableId: newTable.id, regionId },
        });
      }
    }

    // Modifiers
    for (const m of t.modifiers) {
      const autoRegionIds = m.autoRegionNames
        .map((n) => regionNameToId.get(n))
        .filter((id): id is string => !!id);
      const conditionalRegionIds = m.conditionalRegionNames
        .map((n) => regionNameToId.get(n))
        .filter((id): id is string => !!id);

      await prisma.tableModifier.create({
        data: {
          tableId: newTable.id,
          label: m.label,
          behavior: m.behavior,
          rollAdjustment: m.rollAdjustment,
          extraConfig: m.extraConfig ?? null,
          autoRegions: { connect: autoRegionIds.map((id) => ({ id })) },
          conditionalRegions: { connect: conditionalRegionIds.map((id) => ({ id })) },
        },
      });
    }
  }

  // ── Campaign-level table references — resolved by name after tables exist ──
  const campaignTableUpdates: Record<string, string | null> = {};
  if (src.defaultReactionTableName) {
    const id = tableNameToId.get(src.defaultReactionTableName) ?? null;
    if (id) campaignTableUpdates.defaultReactionTableId = id;
  }
  if (src.defaultMoraleTableName) {
    const id = tableNameToId.get(src.defaultMoraleTableName) ?? null;
    if (id) campaignTableUpdates.defaultMoraleTableId = id;
  }
  if (src.defaultTraitTableName) {
    const id = tableNameToId.get(src.defaultTraitTableName) ?? null;
    if (id) campaignTableUpdates.defaultTraitTableId = id;
  }
  if (Object.keys(campaignTableUpdates).length > 0) {
    await prisma.campaign.update({
      where: { id: newCampaign.id },
      data: campaignTableUpdates,
    });
  }

  // ── NPC profiles ───────────────────────────────────────────────────────────
  const nameToId = (name: string | null | undefined): string | null =>
    name ? (tableNameToId.get(name) ?? null) : null;

  for (const p of src.npcProfiles) {
    const config = {
      typeLabel: p.typeLabel,
      secondaryTypeLabel: p.secondaryTypeLabel,
      typeTableId: nameToId(p.typeTableName),
      secondaryTypeTableId: nameToId(p.secondaryTypeTableName),
      ageTableId: nameToId(p.ageTableName),
      physicalTableIds: p.physicalTableNames.map((n) => tableNameToId.get(n)).filter((id): id is string => !!id),
      personalityTableIds: p.personalityTableNames.map((n) => tableNameToId.get(n)).filter((id): id is string => !!id),
      detailTableIds: p.detailTableNames
        .map(({ label, tableName }) => {
          const id = tableNameToId.get(tableName);
          return id ? { label, tableId: id } : null;
        })
        .filter((d): d is { label: string; tableId: string } => d !== null),
    };

    await prisma.npcProfile.create({
      data: {
        campaignId: newCampaign.id,
        name: p.name,
        sortOrder: p.sortOrder,
        stepsJson: JSON.stringify(config),
      },
    });
  }

  // ── Calendar config ────────────────────────────────────────────────────────
  if (src.calendarConfig) {
    const cc = src.calendarConfig;
    const newConfig = await prisma.calendarConfig.create({
      data: {
        campaignId: newCampaign.id,
        monthsJson: cc.monthsJson,
        weekdaysJson: cc.weekdaysJson,
        seasonsJson: cc.seasonsJson,
        intercalaryJson: cc.intercalaryJson ?? null,
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

  // ── Calendar notes ─────────────────────────────────────────────────────────
  for (const note of src.calendarNotes) {
    await prisma.calendarNote.create({
      data: {
        campaignId: newCampaign.id,
        date: note.date,
        content: note.content,
      },
    });
  }

  // ── Flags ──────────────────────────────────────────────────────────────────
  for (const f of src.flags) {
    await prisma.campaignFlag.create({
      data: {
        campaignId: newCampaign.id,
        label: f.label,
        color: f.color,
        counter: f.counter ?? null,
        countDirection: f.countDirection ?? null,
        paused: f.paused,
        sortOrder: f.sortOrder,
      },
    });
  }

  // ── Dungeon config ─────────────────────────────────────────────────────────
  if (src.dungeonConfig) {
    await prisma.dungeonConfig.create({
      data: {
        campaignId: newCampaign.id,
        turnsPerHour: src.dungeonConfig.turnsPerHour,
        encounterTurnsJson: src.dungeonConfig.encounterTurnsJson,
      },
    });
  }

  // ── Light source types ─────────────────────────────────────────────────────
  for (const ls of src.lightSourceTypes) {
    await prisma.lightSourceType.create({
      data: {
        campaignId: newCampaign.id,
        name: ls.name,
        defaultDuration: ls.defaultDuration,
        sortOrder: ls.sortOrder,
      },
    });
  }

  return NextResponse.json({ id: newCampaign.id, name: newCampaign.name }, { status: 201 });
}
