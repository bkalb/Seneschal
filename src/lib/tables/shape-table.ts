import type { RandomTable } from "@/types/table";

/**
 * Converts a raw Prisma RandomTable (with nested relations) into the shape
 * expected by rollOnTable and the encounter-roll utilities.
 */
export function shapeTable(raw: any): RandomTable {
  return {
    ...raw,
    category: raw.category as RandomTable["category"],
    regionIds: (raw.regions ?? []).map((r: any) => r.regionId ?? r.id),
    rollWhenNoSeason: (raw.rollWhenNoSeason ?? "always") as RandomTable["rollWhenNoSeason"],
    npcForType: raw.npcForType ?? null,
    npcForGender: raw.npcForGender ?? null,
    applicableModes: raw.applicableModes ?? "BOTH",
    modifiers: (raw.modifiers ?? []).map((m: any) => ({
      ...m,
      behavior: m.behavior as RandomTable["modifiers"][number]["behavior"],
      extraConfig: m.extraConfig ? JSON.parse(m.extraConfig) : null,
      autoRegionIds: (m.autoRegions ?? []).map((r: any) => r.id),
      conditionalRegionIds: (m.conditionalRegions ?? []).map((r: any) => r.id),
    })),
  } as unknown as RandomTable;
}

/** Prisma include fragment for a fully-shaped RandomTable. */
export const tableInclude = {
  rows: { orderBy: { min: "asc" as const } },
  modifiers: { include: { autoRegions: true, conditionalRegions: true } },
  regions: { include: { region: true } },
} as const;
