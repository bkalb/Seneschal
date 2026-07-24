// ── Table category ────────────────────────────────────────────────────────────

export type TableCategory = "NPC" | "ENCOUNTER" | "CALENDAR" | "REACTION" | "MORALE" | "GENERAL";

export const TABLE_CATEGORIES: Record<TableCategory, string> = {
  NPC: "NPC Generator",
  ENCOUNTER: "Random Encounter Generator",
  CALENDAR: "Calendar",
  REACTION: "Reaction",
  MORALE: "Morale",
  GENERAL: "General",
};

// ── Modifier behavior variants ────────────────────────────────────────────────

export type ModifierBehavior =
  | "ALWAYS"
  | "AUTO_REGION"
  | "CONDITIONAL_REGION"
  // Fires automatically when the previous day's modified result meets the condition.
  | "PREV_RESULT_CONDITION";

export interface TableModifier {
  id: string;
  tableId: string;
  label: string;
  behavior: ModifierBehavior;
  rollAdjustment: number;
  extraConfig?: ModifierExtraConfig | null;
  autoRegionIds: string[];
  conditionalRegionIds: string[];
}

export type ModifierExtraConfig =
  | { type: "override_outcome"; outcomeText: string }
  | { type: "prev_result_condition"; operator: "lte" | "gte" | "eq"; threshold: number };

// ── Table rows ────────────────────────────────────────────────────────────────

export interface TableRow {
  id: string;
  tableId: string;
  min: number;
  max: number;
  outcome: string;
}

// ── Full table ────────────────────────────────────────────────────────────────

export type RollWhenNoSeason = "always" | "skip";

export interface RandomTable {
  id: string;
  campaignId: string;
  name: string;
  category: TableCategory;
  diceExpression: string;
  isStateful: boolean;
  lastResult: number | null;
  lastModifiedResult: number | null;
  rollOnDayAdvance: boolean;
  seasonName: string | null;
  rollWhenNoSeason: RollWhenNoSeason;
  manualModifier: number;
  surpriseDice: string | null;
  surpriseThreshold: number | null;
  npcForType: string | null;
  npcForGender: string | null;
  // "OVERLAND" | "DUNGEON" | "BOTH"
  applicableModes: string;
  sortOrder: number;
  // Optional prerequisite die check: roll this dice first; only roll on the table
  // if the result falls within [prerequisiteMin, prerequisiteMax] (inclusive).
  prerequisiteDice: string | null;
  prerequisiteMin: number | null;
  prerequisiteMax: number | null;
  rows: TableRow[];
  modifiers: TableModifier[];
  regionIds: string[];
}

// ── Dice engine types ─────────────────────────────────────────────────────────

export interface DiceExpression {
  count: number;
  sides: number;
  raw: string;
  modifier?: number;                 // flat ±K, default 0
  keep?: { mode: "h" | "l"; count: number } | null;
}

export interface DiceRollResult {
  expression: DiceExpression;
  rolls: number[];
  // The dice that counted toward `total` (all of `rolls` unless keep/drop applies).
  kept: number[];
  total: number;
}

// ── Roll resolution ───────────────────────────────────────────────────────────

export interface InlineRoll {
  notation: string;
  result: number;
}

export interface ResolvedOutcome {
  rawText: string;
  expandedText: string;
  inlineRolls: InlineRoll[];
}

export interface AppliedModifier {
  label: string;
  adjustment: number;
  source: "auto" | "user_toggle";
}

export interface ReactionResult {
  tableName: string;
  roll: number;
  outcome: string;
}

export interface SurpriseResult {
  dice: string;
  roll: number;
  threshold: number;
  surprised: boolean;
}

export interface PrerequisiteRoll {
  dice: string;
  result: number;
  min: number;
  max: number;
  passed: boolean;
}

export interface SubRollEntry {
  roll: number;
  outcome: string;
  expandedOutcome: string;
  inlineRolls: { notation: string; result: number }[];
}

export interface SubRoll {
  notation: string;       // e.g. "d20"
  label: string | null;   // e.g. "each side", or null for a single roll
  results: SubRollEntry[];
}

export interface TableRollResult {
  tableId: string;
  tableName: string;
  rawDiceTotal: number;
  diceTotal: number;
  appliedModifiers: AppliedModifier[];
  matchedRow: TableRow;
  resolvedOutcome: ResolvedOutcome;
  timestamp: number;
  // Populated for ENCOUNTER rolls when a reaction table / surprise are configured
  reaction?: ReactionResult | null;
  surprise?: SurpriseResult | null;
  // Sub-rolls detected from outcome text (e.g. "roll a d20 for each side")
  subRolls?: SubRoll[];
  // Populated when the table has a prerequisite die check configured.
  // When passed === false the main table was not rolled (outcome is "No encounter").
  prerequisiteRoll?: PrerequisiteRoll | null;
}

// ── Import types ──────────────────────────────────────────────────────────────

export interface ParsedTablePreview {
  detectedDiceExpression: string;
  rows: Array<{ min: number; max: number; outcome: string }>;
  warnings: string[];
}
