import type { NpcProfile, NpcProfileConfig, GeneratedNpc, Gender, GenderSelection, NpcRecipe, NpcField } from "@/types/npc";
import type { RandomTable } from "@/types/table";
import { rollOnTable } from "@/lib/tables/engine";

export function resolveGender(selection: GenderSelection): Gender {
  if (selection !== "random") return selection;
  return Math.random() < 0.5 ? "male" : "female";
}

/**
 * Find the best-matching name table for a given type result and gender.
 * Priority (highest first):
 *   1. npcForType matches AND npcForGender matches
 *   2. npcForType matches AND npcForGender is null (any)
 *   3. npcForType is null (any)  AND npcForGender matches
 *   4. npcForType is null (any)  AND npcForGender is null (any)
 * Returns null if no NPC table with npcForType or npcForGender set exists at all
 * (meaning the profile has no name tables configured via tags).
 */
export function resolveNameTable(
  tables: Map<string, RandomTable>,
  type: string | null,
  gender: Gender
): RandomTable | null {
  const nameTables = [...tables.values()].filter(
    (t) => t.category === "NPC" && (t.npcForType !== null || t.npcForGender !== null)
  );
  if (nameTables.length === 0) return null;

  const typeNorm = type?.toLowerCase() ?? null;

  // Score each table: higher is better
  function score(t: RandomTable): number {
    // npcForType may be comma-separated, e.g. "Ruislip, Talford"
    const typeMatch = typeNorm !== null && t.npcForType !== null &&
      t.npcForType.split(",").some((v) => v.trim().toLowerCase() === typeNorm);
    const typeAny = t.npcForType === null;
    const genderMatch = t.npcForGender === gender;
    const genderAny = t.npcForGender === null;

    if (typeMatch && genderMatch) return 4;
    if (typeMatch && genderAny)   return 3;
    if (typeAny   && genderMatch) return 2;
    if (typeAny   && genderAny)   return 1;
    return 0; // npcForType set but doesn't match — don't use
  }

  const best = nameTables
    .map((t) => ({ t, s: score(t) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s)[0];

  return best?.t ?? null;
}

/**
 * Roll on a table and return the expanded text outcome.
 */
function roll(table: RandomTable, regionId: string | null): string {
  return rollOnTable(table, regionId, []).resolvedOutcome.expandedText;
}

/**
 * Generate a single NPC.
 * usedNames: set of names already used in this batch — will reroll up to 10 times to avoid duplicates.
 */
export function generateNpc(
  profile: NpcProfile,
  tableMap: Map<string, RandomTable>,
  currentRegionId: string | null,
  genderSelection: GenderSelection,
  usedNames: Set<string>
): GeneratedNpc {
  const config: NpcProfileConfig = profile.config;
  const gender = resolveGender(genderSelection);

  // Type
  const typeTable = config.typeTableId ? tableMap.get(config.typeTableId) : null;
  const type = typeTable ? roll(typeTable, currentRegionId) : null;

  // Secondary type
  const secondaryTypeTable = config.secondaryTypeTableId ? tableMap.get(config.secondaryTypeTableId) : null;
  const secondaryType = secondaryTypeTable ? roll(secondaryTypeTable, currentRegionId) : null;

  // Age
  const ageTable = config.ageTableId ? tableMap.get(config.ageTableId) : null;
  const age = ageTable ? roll(ageTable, currentRegionId) : null;

  // Name — auto-resolved from tagged name tables, with duplicate reroll
  const nameTable = resolveNameTable(tableMap, type, gender);
  let name: string | null = null;
  if (nameTable) {
    const MAX_REROLLS = 10;
    let candidate = roll(nameTable, currentRegionId);
    for (let i = 0; i < MAX_REROLLS && usedNames.has(candidate); i++) {
      candidate = roll(nameTable, currentRegionId);
    }
    name = candidate;
    usedNames.add(name);
  }

  // Physical traits
  const physicalTables = config.physicalTableIds
    .map((id) => tableMap.get(id))
    .filter((t): t is RandomTable => !!t);
  const physical = physicalTables.map((t) => roll(t, currentRegionId));

  // Personality traits
  const personalityTables = config.personalityTableIds
    .map((id) => tableMap.get(id))
    .filter((t): t is RandomTable => !!t);
  const personality = personalityTables.map((t) => roll(t, currentRegionId));

  // Detail tables
  const detailEntries = config.detailTableIds
    .map(({ label, tableId }) => {
      const t = tableMap.get(tableId);
      if (!t) return null;
      return { label, tableId, value: roll(t, currentRegionId) };
    })
    .filter((d): d is { label: string; tableId: string; value: string } => d !== null);
  const details = detailEntries.map(({ label, value }) => ({ label, value }));

  // Recipe — the exact tables this NPC was rolled from, so it can be re-rolled
  // later with no set/profile context (D2). Purely additive: nothing above
  // this point changes existing generation behavior.
  //
  // The trait arrays record only the tables that actually resolved, so
  // recipe.physicalTableIds[i] always describes physical[i]. Per-field re-roll
  // indexes by slot, so an unfiltered copy of the profile config would point
  // at the wrong table whenever a configured table was already missing.
  const recipe: NpcRecipe = {
    regionId: currentRegionId,
    genderSelection,
    typeTableId: config.typeTableId,
    secondaryTypeTableId: config.secondaryTypeTableId,
    ageTableId: config.ageTableId,
    nameTableId: nameTable?.id ?? null,
    physicalTableIds: physicalTables.map((t) => t.id),
    personalityTableIds: personalityTables.map((t) => t.id),
    detailTables: detailEntries.map(({ label, tableId }) => ({ label, tableId })),
  };

  return {
    name,
    gender,
    age,
    type,
    typeLabel: config.typeLabel,
    secondaryType,
    secondaryTypeLabel: config.secondaryTypeLabel,
    physical,
    personality,
    details,
    recipe,
  };
}

/**
 * Generate a batch of NPCs, deduplicating names across the batch.
 */
export function generateNpcBatch(
  count: number,
  profile: NpcProfile,
  tableMap: Map<string, RandomTable>,
  currentRegionId: string | null,
  genderSelection: GenderSelection
): GeneratedNpc[] {
  const usedNames = new Set<string>();
  return Array.from({ length: count }, () =>
    generateNpc(profile, tableMap, currentRegionId, genderSelection, usedNames)
  );
}

/**
 * Re-roll every slot of an NPC, replaying its captured recipe. Uses
 * `recipe.regionId` (the region in effect at original generation), not
 * whatever region is current now (D11) — keeps a set's contents consistent
 * with its own header.
 *
 * If a recipe table id no longer resolves in `tableMap` (deleted, or
 * recategorized out of NPC), that slot's existing value is kept rather than
 * cleared (D12) — one missing table shouldn't blank out the whole card.
 *
 * Returns `npc` unchanged if it has no recipe (hydrated pre-feature data).
 */
export function rerollNpc(
  npc: GeneratedNpc,
  tableMap: Map<string, RandomTable>,
  usedNames: Set<string> = new Set()
): GeneratedNpc {
  const recipe = npc.recipe;
  if (!recipe) return npc;

  const gender = resolveGender(recipe.genderSelection);

  // Type / secondary type / age — roll where the table still resolves, else
  // keep the existing value (D12).
  const typeTable = recipe.typeTableId ? tableMap.get(recipe.typeTableId) : undefined;
  const type = typeTable ? roll(typeTable, recipe.regionId) : npc.type;

  const secondaryTypeTable = recipe.secondaryTypeTableId ? tableMap.get(recipe.secondaryTypeTableId) : undefined;
  const secondaryType = secondaryTypeTable ? roll(secondaryTypeTable, recipe.regionId) : npc.secondaryType;

  const ageTable = recipe.ageTableId ? tableMap.get(recipe.ageTableId) : undefined;
  const age = ageTable ? roll(ageTable, recipe.regionId) : npc.age;

  // Name — re-resolve against the (possibly changed) type + gender, with the
  // same duplicate-avoidance loop generateNpc uses. Keep the existing name if
  // no name table resolves at all.
  const nameTable = resolveNameTable(tableMap, type, gender);
  let name = npc.name;
  let nameTableId = recipe.nameTableId;
  if (nameTable) {
    const MAX_REROLLS = 10;
    let candidate = roll(nameTable, recipe.regionId);
    for (let i = 0; i < MAX_REROLLS && usedNames.has(candidate); i++) {
      candidate = roll(nameTable, recipe.regionId);
    }
    name = candidate;
    usedNames.add(name);
    nameTableId = nameTable.id;
  }

  // Physical / personality / detail traits — same per-slot degrade rule (D12).
  const physical = recipe.physicalTableIds.map((id, i) => {
    const t = tableMap.get(id);
    return t ? roll(t, recipe.regionId) : (npc.physical[i] ?? "");
  });
  const personality = recipe.personalityTableIds.map((id, i) => {
    const t = tableMap.get(id);
    return t ? roll(t, recipe.regionId) : (npc.personality[i] ?? "");
  });
  const details = recipe.detailTables.map((d, i) => {
    const t = tableMap.get(d.tableId);
    return {
      label: d.label,
      value: t ? roll(t, recipe.regionId) : (npc.details[i]?.value ?? ""),
    };
  });

  return {
    ...npc,
    name,
    gender,
    age,
    type,
    secondaryType,
    physical,
    personality,
    details,
    recipe: { ...recipe, nameTableId },
    savedNpcId: null, // D8 — re-roll clears the saved badge; the DB row is untouched
  };
}

/**
 * Re-roll exactly one field of an NPC, using its captured recipe.
 *
 * Two fields have special handling:
 *  - `type`: after rolling a new type, the name table is re-resolved
 *    (resolveNameTable depends on type + gender). The name is only re-rolled
 *    if that resolution lands on a *different* table than before (D5) — a
 *    type re-roll that keeps the same name table leaves the name alone.
 *  - `name`: rolls `recipe.nameTableId` directly, without re-resolving — the
 *    pinned table is where this NPC's name comes from.
 *
 * If the target field's table is missing from `tableMap`, returns `npc`
 * unchanged (defense-in-depth; the UI is expected to disable that ↻ already).
 */
export function rerollNpcField(
  npc: GeneratedNpc,
  field: NpcField,
  tableMap: Map<string, RandomTable>
): GeneratedNpc {
  const recipe = npc.recipe;
  if (!recipe) return npc;

  switch (field.kind) {
    case "name": {
      const nameTable = recipe.nameTableId ? tableMap.get(recipe.nameTableId) : undefined;
      if (!nameTable) return npc;
      return { ...npc, name: roll(nameTable, recipe.regionId), savedNpcId: null };
    }

    case "type": {
      const typeTable = recipe.typeTableId ? tableMap.get(recipe.typeTableId) : undefined;
      if (!typeTable) return npc;
      const type = roll(typeTable, recipe.regionId);

      const resolvedNameTable = resolveNameTable(tableMap, type, npc.gender);
      if (resolvedNameTable && resolvedNameTable.id !== recipe.nameTableId) {
        // Resolved name table changed — cascade to name (D5).
        const name = roll(resolvedNameTable, recipe.regionId);
        return {
          ...npc,
          type,
          name,
          recipe: { ...recipe, nameTableId: resolvedNameTable.id },
          savedNpcId: null,
        };
      }
      return { ...npc, type, savedNpcId: null };
    }

    case "secondaryType": {
      const t = recipe.secondaryTypeTableId ? tableMap.get(recipe.secondaryTypeTableId) : undefined;
      if (!t) return npc;
      return { ...npc, secondaryType: roll(t, recipe.regionId), savedNpcId: null };
    }

    case "age": {
      const t = recipe.ageTableId ? tableMap.get(recipe.ageTableId) : undefined;
      if (!t) return npc;
      return { ...npc, age: roll(t, recipe.regionId), savedNpcId: null };
    }

    case "physical": {
      const id = recipe.physicalTableIds[field.index];
      const t = id ? tableMap.get(id) : undefined;
      if (!t) return npc;
      const physical = [...npc.physical];
      physical[field.index] = roll(t, recipe.regionId);
      return { ...npc, physical, savedNpcId: null };
    }

    case "personality": {
      const id = recipe.personalityTableIds[field.index];
      const t = id ? tableMap.get(id) : undefined;
      if (!t) return npc;
      const personality = [...npc.personality];
      personality[field.index] = roll(t, recipe.regionId);
      return { ...npc, personality, savedNpcId: null };
    }

    case "detail": {
      const entry = recipe.detailTables[field.index];
      const t = entry ? tableMap.get(entry.tableId) : undefined;
      if (!t || !entry) return npc;
      const details = [...npc.details];
      details[field.index] = { label: entry.label, value: roll(t, recipe.regionId) };
      return { ...npc, details, savedNpcId: null };
    }

    default:
      return npc;
  }
}
