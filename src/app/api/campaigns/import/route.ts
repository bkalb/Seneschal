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
import { createCampaignFromData } from "@/lib/campaign-transfer";

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

  const result = await prisma.$transaction(
    (tx) => createCampaignFromData(tx, userId, src),
    { timeout: 30000 }
  );

  return NextResponse.json(result, { status: 201 });
}
