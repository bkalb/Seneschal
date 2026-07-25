import type { SavedNpcData } from "@/types/savedNpc";

let seq = 0;

/** Shared factory for a fully-populated SavedNpcData test fixture. */
export function makeSavedNpc(overrides: Partial<SavedNpcData> = {}): SavedNpcData {
  seq += 1;
  const now = new Date().toISOString();
  return {
    id: `npc-fixture-${seq}`,
    campaignId: "camp1",
    affiliationId: null,
    name: "Aldric",
    gender: "male",
    age: "34",
    type: "Ruislip",
    typeLabel: "Homeland",
    secondaryType: null,
    secondaryTypeLabel: null,
    physical: [],
    personality: [],
    details: [],
    isDeceased: false,
    isPinned: false,
    notes: null,
    isCombatant: false,
    combatAc: null,
    combatHd: null,
    combatMaxHp: null,
    combatAttackBonus: null,
    combatAttackDamage: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
