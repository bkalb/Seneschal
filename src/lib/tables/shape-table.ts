import type { Prisma } from "@prisma/client";
import type { RandomTable } from "@/types/table";

/** Prisma include fragment for a fully-shaped RandomTable. */
export const tableInclude = {
  rows: { orderBy: { min: "asc" as const } },
  modifiers: { include: { autoRegions: true, conditionalRegions: true } },
  regions: { include: { region: true } },
} as const;

/** `tableInclude` plus the owning campaign — for routes that need campaign defaults. */
export const tableIncludeWithCampaign = { ...tableInclude, campaign: true } as const;

export type RawTable = Prisma.RandomTableGetPayload<{ include: typeof tableInclude }>;

/**
 * Converts a raw Prisma RandomTable (with nested relations) into the shape
 * expected by rollOnTable and the encounter-roll utilities.
 */
export function shapeTable(raw: RawTable): RandomTable {
  return {
    ...raw,
    category: raw.category as RandomTable["category"],
    regionIds: (raw.regions ?? []).map((r) => r.regionId),
    rollWhenNoSeason: (raw.rollWhenNoSeason ?? "always") as RandomTable["rollWhenNoSeason"],
    npcForType: raw.npcForType ?? null,
    npcForGender: raw.npcForGender ?? null,
    applicableModes: raw.applicableModes ?? "BOTH",
    modifiers: (raw.modifiers ?? []).map((m) => ({
      ...m,
      behavior: m.behavior as RandomTable["modifiers"][number]["behavior"],
      extraConfig: m.extraConfig ? JSON.parse(m.extraConfig) : null,
      autoRegionIds: (m.autoRegions ?? []).map((r) => r.id),
      conditionalRegionIds: (m.conditionalRegions ?? []).map((r) => r.id),
    })),
  };
}
