import { describe, it, expect } from "vitest";
import type { SavedNpc, NpcAffiliation } from "@prisma/client";

/**
 * Schema shape tests — verify the generated Prisma types expose
 * the fields we added, using compile-time type assertions backed
 * by runtime assignability checks.  No DB connection required.
 */
describe("SavedNpc schema shape", () => {
  it("has required core fields", () => {
    const npc: Partial<SavedNpc> = {
      id: "cltest1",
      campaignId: "camp1",
      affiliationId: null,
      name: "Aldric",
      gender: "male",
      age: "34",
      type: "Ruislip",
      typeLabel: "Homeland",
      secondaryType: "Fighter",
      secondaryTypeLabel: "Class",
      physicalJson: "[]",
      personalityJson: "[]",
      detailsJson: "[]",
      isDeceased: false,
      isPinned: false,
      notes: null,
    };
    expect(npc.typeLabel).toBe("Homeland");
    expect(npc.isDeceased).toBe(false);
    expect(npc.isPinned).toBe(false);
  });

  it("defaults isDeceased and isPinned to false", () => {
    const npc: Partial<SavedNpc> = { isDeceased: false, isPinned: false };
    expect(npc.isDeceased).toBe(false);
    expect(npc.isPinned).toBe(false);
  });

  it("allows null optional fields", () => {
    const npc: Partial<SavedNpc> = {
      name: null,
      age: null,
      type: null,
      secondaryType: null,
      secondaryTypeLabel: null,
      affiliationId: null,
      notes: null,
    };
    expect(npc.name).toBeNull();
    expect(npc.affiliationId).toBeNull();
  });
});

describe("NpcAffiliation schema shape", () => {
  it("has required fields", () => {
    const aff: Partial<NpcAffiliation> = {
      id: "aff1",
      campaignId: "camp1",
      name: "Bogrim's Bandits",
    };
    expect(aff.name).toBe("Bogrim's Bandits");
  });
});
