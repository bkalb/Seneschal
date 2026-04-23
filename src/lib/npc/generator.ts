import type { NpcProfile, NpcProfileConfig, GeneratedNpc, Gender, GenderSelection } from "@/types/npc";
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
  const physical = config.physicalTableIds
    .map((id) => tableMap.get(id))
    .filter((t): t is RandomTable => !!t)
    .map((t) => roll(t, currentRegionId));

  // Personality traits
  const personality = config.personalityTableIds
    .map((id) => tableMap.get(id))
    .filter((t): t is RandomTable => !!t)
    .map((t) => roll(t, currentRegionId));

  // Detail tables
  const details = config.detailTableIds
    .map(({ label, tableId }) => {
      const t = tableMap.get(tableId);
      if (!t) return null;
      return { label, value: roll(t, currentRegionId) };
    })
    .filter((d): d is { label: string; value: string } => d !== null);

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
