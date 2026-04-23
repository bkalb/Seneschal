// ─── NPC Profile ──────────────────────────────────────────────────────────────

export type Gender = "male" | "female";
export type GenderSelection = Gender | "random";

/**
 * Structured configuration for an NPC profile.
 * Replaces the old freeform step list.
 *
 * Generation order (all slots optional except gender):
 *   gender → type → secondaryType → age → name (auto-resolved) →
 *   physical traits → personality traits → detail rolls
 */
export interface NpcProfileConfig {
  /** Label shown in output for the primary type roll, e.g. "Homeland", "Ancestry" */
  typeLabel: string;
  /** Optional label for a secondary type, e.g. "Class". Null if not used. */
  secondaryTypeLabel: string | null;
  /** Table to roll for primary type. Null = skip. */
  typeTableId: string | null;
  /** Table to roll for secondary type. Null = skip. */
  secondaryTypeTableId: string | null;
  /** Table to roll for age. Outcome string is used directly. Null = skip. */
  ageTableId: string | null;
  /** Tables rolled for physical trait lines (one roll each, label = "Physical"). */
  physicalTableIds: string[];
  /** Tables rolled for personality trait lines (one roll each, label = "Personality"). */
  personalityTableIds: string[];
  /** Additional labelled rolls shown after core fields. */
  detailTableIds: { label: string; tableId: string }[];
}

export interface NpcProfile {
  id: string;
  campaignId: string;
  name: string;
  sortOrder: number;
  config: NpcProfileConfig;
}

// ─── Generation result ────────────────────────────────────────────────────────

export interface GeneratedNpc {
  /** Resolved name from the matched name table. Null if no name table found. */
  name: string | null;
  gender: Gender;
  /** Age string as returned by the age table, e.g. "32". Null if no age table. */
  age: string | null;
  /** Primary type value rolled, e.g. "Ruislip". Null if no type table. */
  type: string | null;
  /** The label for the type field as configured in the profile. */
  typeLabel: string;
  /** Secondary type value, e.g. "Fighter". Null if not configured or no table. */
  secondaryType: string | null;
  secondaryTypeLabel: string | null;
  /** Outcomes from physical trait tables. */
  physical: string[];
  /** Outcomes from personality trait tables. */
  personality: string[];
  /** Outcomes from detail tables, each with its configured label. */
  details: { label: string; value: string }[];
}
