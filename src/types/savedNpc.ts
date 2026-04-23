export interface SavedNpcData {
  id: string;
  campaignId: string;
  affiliationId: string | null;
  name: string | null;
  gender: string;
  age: string | null;
  type: string | null;
  typeLabel: string;
  secondaryType: string | null;
  secondaryTypeLabel: string | null;
  physical: string[];
  personality: string[];
  details: { label: string; value: string }[];
  isDeceased: boolean;
  isPinned: boolean;
  notes: string | null;
  isCombatant: boolean;
  combatAc: number | null;
  combatHd: string | null;
  combatMaxHp: number | null;
  combatAttackBonus: number | null;
  combatAttackDamage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NpcAffiliationData {
  id: string;
  campaignId: string;
  name: string;
  createdAt: string;
}
