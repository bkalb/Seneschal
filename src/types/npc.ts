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

/**
 * Everything needed to re-roll an NPC exactly the way it was first made.
 * Fully self-contained: rerollNpc() needs no set or profile context.
 * `nameTableId` is the *resolved* table (resolveNameTable depends on the
 * rolled type + gender), so it is genuinely per-NPC, not per-set.
 */
export interface NpcRecipe {
  /** Region in effect at generation. Replayed on every re-roll (D11). */
  regionId: string | null;
  /** Gender selection in effect at generation. Re-applied on whole-card re-roll (D4). */
  genderSelection: GenderSelection;
  typeTableId: string | null;
  secondaryTypeTableId: string | null;
  ageTableId: string | null;
  nameTableId: string | null;
  physicalTableIds: string[];
  personalityTableIds: string[];
  detailTables: { label: string; tableId: string }[];
}

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
  /** Present on generated NPCs. Optional so older persisted history hydrates cleanly. */
  recipe?: NpcRecipe;
  /** Id of the library record this card was saved as. Cleared on re-roll (D8). */
  savedNpcId?: string | null;
}

/** Re-roll target for per-field re-roll. */
export type NpcField =
  | { kind: "name" }
  | { kind: "type" }
  | { kind: "secondaryType" }
  | { kind: "age" }
  | { kind: "physical"; index: number }
  | { kind: "personality"; index: number }
  | { kind: "detail"; index: number };
