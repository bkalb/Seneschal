/**
 * Shared campaign transfer logic.
 *
 * `serializeCampaign` turns a fully-loaded Campaign record into the
 * name-resolved, ID-free payload shape used by both the export file format
 * and campaign duplication.
 *
 * `createCampaignFromData` takes that same payload shape (either freshly
 * serialized from an existing campaign, or parsed from an uploaded export
 * file) and creates a brand new campaign from it inside a transaction.
 *
 * Keeping both directions in one module means export, import, and duplicate
 * can never drift from each other — there is exactly one definition of what
 * a "full campaign" consists of.
 */
import { Prisma } from "@prisma/client";

// ── Shared `include` for loading a campaign in full ───────────────────────

export const campaignTransferInclude = {
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
  calendarEvents: { orderBy: { createdAt: "asc" } },
  flags: { orderBy: { sortOrder: "asc" } },
  dungeonConfig: true,
  lightSourceTypes: { orderBy: { sortOrder: "asc" } },
  npcAffiliations: { orderBy: { name: "asc" } },
  savedNpcs: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.CampaignInclude;

export type CampaignWithTransferData = Prisma.CampaignGetPayload<{
  include: typeof campaignTransferInclude;
}>;

// ── Payload shape (name-resolved, no internal IDs) ────────────────────────

export interface CampaignTransferPayload {
  name: string;
  defaultSurpriseDice?: string | null;
  defaultSurpriseThreshold?: number | null;
  defaultReactionTableName?: string | null;
  defaultMoraleTableName?: string | null;
  encounterWindowsJson: string;
  defaultCombatAC?: number | null;
  defaultCombatHD?: string | null;
  defaultCombatAttackBonus?: number | null;
  defaultCombatAttackDamage?: string | null;
  defaultRollHpIndividually: boolean;
  defaultTraitTableName?: string | null;
  defaultTraitCount?: number | null;
  state?: {
    currentDate: string;
    mode: string;
    currentTime: string;
    forecastingMode: boolean;
    currentRegionName?: string | null;
    currentDungeonRegionName?: string | null;
    // JSON array of today's weather rolls (in-progress session state)
    todayWeatherJson?: string | null;
    // JSON: encounter panel last roll per mode
    encounterPanelStateJson?: string | null;
    // JSON: calendar day/night encounter summaries
    calendarEncounterStateJson?: string | null;
  };
  regions: Array<{ name: string; rerollOnSwitch: boolean; regionType: string }>;
  rulesSections: Array<{
    title: string;
    content: string;
    sortOrder: number;
    applicableModes: string;
  }>;
  randomTables: Array<{
    name: string;
    category: string;
    diceExpression: string;
    isStateful: boolean;
    rollOnDayAdvance: boolean;
    seasonName?: string | null;
    rollWhenNoSeason: string;
    manualModifier: number;
    surpriseDice?: string | null;
    surpriseThreshold?: number | null;
    sortOrder: number;
    applicableModes: string;
    npcForType?: string | null;
    npcForGender?: string | null;
    prerequisiteDice?: string | null;
    prerequisiteMin?: number | null;
    prerequisiteMax?: number | null;
    // Stateful / in-progress roll state — carried across export/import/duplicate
    // so a mid-session transfer doesn't lose the current or forecast result.
    lastResult?: number | null;
    lastModifiedResult?: number | null;
    forecastResult?: number | null;
    forecastModifiedResult?: number | null;
    forecastDate?: string | null;
    forecastOutcome?: string | null;
    rows: Array<{ min: number; max: number; outcome: string }>;
    regionNames: string[];
    modifiers: Array<{
      label: string;
      behavior: string;
      rollAdjustment: number;
      extraConfig?: string | null;
      autoRegionNames: string[];
      conditionalRegionNames: string[];
    }>;
  }>;
  npcProfiles: Array<{
    name: string;
    sortOrder: number;
    typeLabel: string;
    secondaryTypeLabel?: string | null;
    typeTableName?: string | null;
    secondaryTypeTableName?: string | null;
    ageTableName?: string | null;
    physicalTableNames: string[];
    personalityTableNames: string[];
    detailTableNames: Array<{ label: string; tableName: string }>;
  }>;
  calendarConfig?: {
    monthsJson: string;
    weekdaysJson: string;
    seasonsJson: string;
    intercalaryJson?: string | null;
    epochDate: string;
    moons: Array<{ name: string; cycleLength: number; referenceNewMoon: string }>;
  } | null;
  calendarNotes: Array<{ date: string; content: string }>;
  // moonId is resolved to moonName (moon names are unique within a config);
  // re-resolved to a new moonId after moons are recreated on import.
  calendarEvents: Array<{
    title: string;
    description?: string | null;
    recurrence: string;
    anchorDate: string;
    endDate?: string | null;
    moonName?: string | null;
    moonPhase?: string | null;
    color: string;
  }>;
  flags: Array<{
    label: string;
    color: string;
    counter?: number | null;
    countDirection?: string | null;
    paused: boolean;
    sortOrder: number;
  }>;
  dungeonConfig?: {
    turnsPerHour: number;
    encounterTurnsJson: string;
  } | null;
  lightSourceTypes: Array<{ name: string; defaultDuration: number; sortOrder: number }>;
  // NpcAffiliation names are not DB-unique, but the only creation path
  // (POST /api/npc-affiliation) dedupes by (campaignId, name) before insert,
  // so names are effectively unique per campaign in practice — safe to join by name.
  npcAffiliations: Array<{ name: string }>;
  savedNpcs: Array<{
    name?: string | null;
    gender: string;
    age?: string | null;
    type?: string | null;
    typeLabel: string;
    secondaryType?: string | null;
    secondaryTypeLabel?: string | null;
    physicalJson: string;
    personalityJson: string;
    detailsJson: string;
    isDeceased: boolean;
    isPinned: boolean;
    notes?: string | null;
    isCombatant: boolean;
    combatAc?: number | null;
    combatHd?: string | null;
    combatMaxHp?: number | null;
    combatAttackBonus?: number | null;
    combatAttackDamage?: string | null;
    affiliationName?: string | null;
  }>;
}

/**
 * PURE — turns a fully-loaded campaign (fetched with `campaignTransferInclude`)
 * into the name-resolved payload shape shared by export/import/duplicate.
 */
export function serializeCampaign(
  campaign: CampaignWithTransferData
): CampaignTransferPayload {
  const tableIdToName = new Map<string, string>(
    campaign.randomTables.map((t) => [t.id, t.name])
  );

  const regionIdToName = new Map<string, string>(
    campaign.regions.map((r) => [r.id, r.name])
  );

  const affiliationIdToName = new Map<string, string>(
    campaign.npcAffiliations.map((a) => [a.id, a.name])
  );

  const moonIdToName = new Map<string, string>(
    (campaign.calendarConfig?.moons ?? []).map((m) => [m.id, m.name])
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

  return {
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
      todayWeatherJson: campaign.state?.todayWeatherJson ?? null,
      encounterPanelStateJson: campaign.state?.encounterPanelStateJson ?? null,
      calendarEncounterStateJson: campaign.state?.calendarEncounterStateJson ?? null,
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
      lastResult: t.lastResult,
      lastModifiedResult: t.lastModifiedResult,
      forecastResult: t.forecastResult,
      forecastModifiedResult: t.forecastModifiedResult,
      forecastDate: t.forecastDate,
      forecastOutcome: t.forecastOutcome,
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
    calendarEvents: campaign.calendarEvents.map((e) => ({
      title: e.title,
      description: e.description,
      recurrence: e.recurrence,
      anchorDate: e.anchorDate,
      endDate: e.endDate,
      moonName: e.moonId ? (moonIdToName.get(e.moonId) ?? null) : null,
      moonPhase: e.moonPhase,
      color: e.color,
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
    npcAffiliations: campaign.npcAffiliations.map((a) => ({ name: a.name })),
    savedNpcs: campaign.savedNpcs.map((n) => ({
      name: n.name,
      gender: n.gender,
      age: n.age,
      type: n.type,
      typeLabel: n.typeLabel,
      secondaryType: n.secondaryType,
      secondaryTypeLabel: n.secondaryTypeLabel,
      physicalJson: n.physicalJson,
      personalityJson: n.personalityJson,
      detailsJson: n.detailsJson,
      isDeceased: n.isDeceased,
      isPinned: n.isPinned,
      notes: n.notes,
      isCombatant: n.isCombatant,
      combatAc: n.combatAc,
      combatHd: n.combatHd,
      combatMaxHp: n.combatMaxHp,
      combatAttackBonus: n.combatAttackBonus,
      combatAttackDamage: n.combatAttackDamage,
      affiliationName: n.affiliationId
        ? (affiliationIdToName.get(n.affiliationId) ?? null)
        : null,
    })),
  };
}

/**
 * Creates a brand new campaign (owned by `userId`) from a
 * `CampaignTransferPayload`, inside the given transaction client.
 * All internal cross-references (region/table names) are re-resolved to the
 * newly generated IDs. Used by both the import route and the duplicate route.
 */
export async function createCampaignFromData(
  tx: Prisma.TransactionClient,
  userId: string,
  src: CampaignTransferPayload,
  opts?: { nameOverride?: string }
): Promise<{ id: string; name: string }> {
  // ── Create the campaign shell ──────────────────────────────────────────────
  const newCampaign = await tx.campaign.create({
    data: {
      userId,
      name: opts?.nameOverride ?? src.name,
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
          todayWeatherJson: src.state?.todayWeatherJson ?? null,
          encounterPanelStateJson: src.state?.encounterPanelStateJson ?? null,
          calendarEncounterStateJson: src.state?.calendarEncounterStateJson ?? null,
        },
      },
    },
  });

  // ── Regions ────────────────────────────────────────────────────────────────
  const regionNameToId = new Map<string, string>();
  for (const r of src.regions) {
    const newRegion = await tx.region.create({
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
    await tx.campaignState.update({
      where: { campaignId: newCampaign.id },
      data: {
        ...(currentRegionId ? { currentRegionId } : {}),
        ...(currentDungeonRegionId ? { currentDungeonRegionId } : {}),
      },
    });
  }

  // ── Rules sections ─────────────────────────────────────────────────────────
  for (const s of src.rulesSections) {
    await tx.rulesSection.create({
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
    const newTable = await tx.randomTable.create({
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
        lastResult: t.lastResult ?? null,
        lastModifiedResult: t.lastModifiedResult ?? null,
        forecastResult: t.forecastResult ?? null,
        forecastModifiedResult: t.forecastModifiedResult ?? null,
        forecastDate: t.forecastDate ?? null,
        forecastOutcome: t.forecastOutcome ?? null,
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
        await tx.randomTableRegion.create({
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

      await tx.tableModifier.create({
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
    await tx.campaign.update({
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

    await tx.npcProfile.create({
      data: {
        campaignId: newCampaign.id,
        name: p.name,
        sortOrder: p.sortOrder,
        stepsJson: JSON.stringify(config),
      },
    });
  }

  // ── NPC affiliations ────────────────────────────────────────────────────────
  // Names aren't DB-unique, but the only creation path dedupes by
  // (campaignId, name), so joining by name is safe in practice. Guard
  // against duplicate names in source data anyway by keeping the first.
  const affiliationNameToId = new Map<string, string>();
  for (const a of src.npcAffiliations) {
    if (affiliationNameToId.has(a.name)) continue;
    const newAffiliation = await tx.npcAffiliation.create({
      data: { campaignId: newCampaign.id, name: a.name },
    });
    affiliationNameToId.set(a.name, newAffiliation.id);
  }

  // ── Saved NPCs ─────────────────────────────────────────────────────────────
  for (const n of src.savedNpcs) {
    await tx.savedNpc.create({
      data: {
        campaignId: newCampaign.id,
        affiliationId: n.affiliationName
          ? (affiliationNameToId.get(n.affiliationName) ?? null)
          : null,
        name: n.name ?? null,
        gender: n.gender,
        age: n.age ?? null,
        type: n.type ?? null,
        typeLabel: n.typeLabel,
        secondaryType: n.secondaryType ?? null,
        secondaryTypeLabel: n.secondaryTypeLabel ?? null,
        physicalJson: n.physicalJson,
        personalityJson: n.personalityJson,
        detailsJson: n.detailsJson,
        isDeceased: n.isDeceased,
        isPinned: n.isPinned,
        notes: n.notes ?? null,
        isCombatant: n.isCombatant,
        combatAc: n.combatAc ?? null,
        combatHd: n.combatHd ?? null,
        combatMaxHp: n.combatMaxHp ?? null,
        combatAttackBonus: n.combatAttackBonus ?? null,
        combatAttackDamage: n.combatAttackDamage ?? null,
      },
    });
  }

  // ── Calendar config ────────────────────────────────────────────────────────
  // Moon names are unique within a config, so calendar events (below) can
  // re-resolve their moonName back to the newly generated moon id.
  const moonNameToId = new Map<string, string>();
  if (src.calendarConfig) {
    const cc = src.calendarConfig;
    const newConfig = await tx.calendarConfig.create({
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
      const newMoon = await tx.moon.create({
        data: {
          configId: newConfig.id,
          name: moon.name,
          cycleLength: moon.cycleLength,
          referenceNewMoon: moon.referenceNewMoon,
        },
      });
      moonNameToId.set(moon.name, newMoon.id);
    }
  }

  // ── Calendar notes ─────────────────────────────────────────────────────────
  for (const note of src.calendarNotes) {
    await tx.calendarNote.create({
      data: {
        campaignId: newCampaign.id,
        date: note.date,
        content: note.content,
      },
    });
  }

  // ── Calendar events ────────────────────────────────────────────────────────
  for (const event of src.calendarEvents) {
    await tx.calendarEvent.create({
      data: {
        campaignId: newCampaign.id,
        title: event.title,
        description: event.description ?? null,
        recurrence: event.recurrence,
        anchorDate: event.anchorDate,
        endDate: event.endDate ?? null,
        moonId: event.moonName ? (moonNameToId.get(event.moonName) ?? null) : null,
        moonPhase: event.moonPhase ?? null,
        color: event.color,
      },
    });
  }

  // ── Flags ──────────────────────────────────────────────────────────────────
  for (const f of src.flags) {
    await tx.campaignFlag.create({
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
    await tx.dungeonConfig.create({
      data: {
        campaignId: newCampaign.id,
        turnsPerHour: src.dungeonConfig.turnsPerHour,
        encounterTurnsJson: src.dungeonConfig.encounterTurnsJson,
      },
    });
  }

  // ── Light source types ─────────────────────────────────────────────────────
  for (const ls of src.lightSourceTypes) {
    await tx.lightSourceType.create({
      data: {
        campaignId: newCampaign.id,
        name: ls.name,
        defaultDuration: ls.defaultDuration,
        sortOrder: ls.sortOrder,
      },
    });
  }

  return { id: newCampaign.id, name: newCampaign.name };
}
