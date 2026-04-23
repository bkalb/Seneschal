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
  rows: z.array(rowSchema).default([]),
  regionNames: z.array(z.string()).default([]),
  modifiers: z.array(modifierSchema).default([]),
});

const branchSchema = z.object({
  matchText: z.string().default(""),
  genderFilter: z.enum(["male", "female"]).optional(),
  tableName: z.string().default(""),
  label: z.string(),
});

const stepSchema = z.object({
  id: z.string(),
  type: z.enum(["roll", "gender_branch"]).default("roll"),
  label: z.string(),
  tableName: z.string().default(""),
  branches: z.array(branchSchema).default([]),
});

const npcProfileSchema = z.object({
  name: z.string(),
  sortOrder: z.number().int().default(0),
  steps: z.array(stepSchema).default([]),
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
});

const rulesSectionSchema = z.object({
  title: z.string(),
  content: z.string(),
  sortOrder: z.number().int().default(0),
});

const importSchema = z.object({
  version: z.number().int(),
  campaign: z.object({
    name: z.string(),
    defaultSurpriseDice: z.string().nullable().optional(),
    defaultSurpriseThreshold: z.number().int().nullable().optional(),
    defaultReactionTableName: z.string().nullable().optional(),
    encounterWindowsJson: z.string().default("[]"),
    state: z.object({ currentDate: z.string().default("0001-01-01") }).optional(),
    regions: z.array(regionSchema).default([]),
    rulesSections: z.array(rulesSectionSchema).default([]),
    randomTables: z.array(tableSchema).default([]),
    npcProfiles: z.array(npcProfileSchema).default([]),
    calendarConfig: calendarConfigSchema.nullable().optional(),
    calendarNotes: z.array(noteSchema).default([]),
    flags: z.array(flagSchema).default([]),
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
      state: {
        create: { currentDate: src.state?.currentDate ?? "0001-01-01" },
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
      },
    });
    regionNameToId.set(r.name, newRegion.id);
  }

  // ── Rules sections ─────────────────────────────────────────────────────────
  for (const s of src.rulesSections) {
    await prisma.rulesSection.create({
      data: {
        campaignId: newCampaign.id,
        title: s.title,
        content: s.content,
        sortOrder: s.sortOrder,
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

  // ── defaultReactionTableId — resolved by name after tables are created ─────
  if (src.defaultReactionTableName) {
    const reactionTableId = tableNameToId.get(src.defaultReactionTableName) ?? null;
    if (reactionTableId) {
      await prisma.campaign.update({
        where: { id: newCampaign.id },
        data: { defaultReactionTableId: reactionTableId },
      });
    }
  }

  // ── NPC profiles ───────────────────────────────────────────────────────────
  for (const p of src.npcProfiles) {
    // Re-attach tableId from tableName using the new ID map
    const resolvedSteps = p.steps.map((step) => ({
      id: step.id,
      type: step.type,
      label: step.label,
      tableId: step.tableName ? (tableNameToId.get(step.tableName) ?? "") : "",
      branches: step.branches.map((b) => ({
        matchText: b.matchText,
        ...(b.genderFilter ? { genderFilter: b.genderFilter } : {}),
        tableId: b.tableName ? (tableNameToId.get(b.tableName) ?? "") : "",
        label: b.label,
      })),
    }));

    await prisma.npcProfile.create({
      data: {
        campaignId: newCampaign.id,
        name: p.name,
        sortOrder: p.sortOrder,
        stepsJson: JSON.stringify(resolvedSteps),
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

  return NextResponse.json({ id: newCampaign.id, name: newCampaign.name }, { status: 201 });
}
