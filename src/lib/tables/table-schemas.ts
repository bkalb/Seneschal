// Zod schemas for the RandomTable REST endpoints, factored out of the route
// handlers so they can be unit-tested without pulling in the Prisma client
// (route.ts files import `@/lib/prisma`, which opens a DB connection as a
// module-level side effect — undesirable in a unit test).
import { z } from "zod";

export const TABLE_CATEGORIES = ["NPC", "ENCOUNTER", "CALENDAR", "REACTION", "MORALE", "GENERAL"] as const;

/**
 * Payload accepted by POST /api/random-tables. Kept in sync with
 * `CreateTableInput` in `@/types/table` and, where fields overlap, with
 * `updateSchema` in `src/app/api/random-tables/[id]/route.ts`.
 */
export const createTableSchema = z.object({
  campaignId: z.string(),
  name: z.string().min(1).max(200),
  category: z.enum(TABLE_CATEGORIES),
  diceExpression: z.string().min(1),
  isStateful: z.boolean().default(false),
  rollOnDayAdvance: z.boolean().default(false),
  // If set, this table only auto-rolls when the current season name matches
  // (comma-joined list of season names — see `tablePassesFilter` in the
  // calendar advance/forecast routes and `parseSeasonNames` in TableEditModal).
  seasonName: z.string().nullable().optional(),
  rollWhenNoSeason: z.enum(["always", "skip"]).optional(),
  rows: z.array(z.object({ min: z.number().int(), max: z.number().int(), outcome: z.string() })),
  modifiers: z.array(z.object({
    label: z.string(),
    behavior: z.enum(["ALWAYS", "AUTO_REGION", "CONDITIONAL_REGION"]),
    rollAdjustment: z.number().int().default(0),
    extraConfig: z.string().nullable().optional(),
    autoRegionIds: z.array(z.string()).default([]),
    conditionalRegionIds: z.array(z.string()).default([]),
  })).default([]),
  regionIds: z.array(z.string()).default([]),
  surpriseDice: z.string().nullable().optional(),
  surpriseThreshold: z.number().int().nullable().optional(),
  npcForType: z.string().nullable().optional(),
  npcForGender: z.string().nullable().optional(),
});
