import { describe, it, expect, afterEach, vi } from "vitest";
import type { NpcProfile, NpcProfileConfig, GeneratedNpc } from "@/types/npc";
import type { RandomTable, TableRow, TableModifier } from "@/types/table";
import { generateNpc, rerollNpc, rerollNpcField } from "@/lib/npc/generator";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<TableRow>): TableRow {
  return { id: "row", tableId: "table1", min: 1, max: 1, outcome: "Nothing", ...overrides };
}

function makeModifier(overrides: Partial<TableModifier>): TableModifier {
  return {
    id: "mod1",
    tableId: "table1",
    label: "Modifier",
    behavior: "ALWAYS",
    rollAdjustment: 1,
    extraConfig: null,
    autoRegionIds: [],
    conditionalRegionIds: [],
    ...overrides,
  };
}

function makeTable(overrides: Partial<RandomTable> = {}): RandomTable {
  return {
    id: "table1",
    campaignId: "camp1",
    name: "Test Table",
    category: "NPC",
    diceExpression: "1d1",
    isStateful: false,
    lastResult: null,
    lastModifiedResult: null,
    forecastResult: null,
    forecastModifiedResult: null,
    forecastDate: null,
    forecastOutcome: null,
    rollOnDayAdvance: false,
    seasonName: null,
    rollWhenNoSeason: "always",
    manualModifier: 0,
    surpriseDice: null,
    surpriseThreshold: null,
    npcForType: null,
    npcForGender: null,
    applicableModes: "BOTH",
    sortOrder: 0,
    prerequisiteDice: null,
    prerequisiteMin: null,
    prerequisiteMax: null,
    rows: [makeRow({ id: "r1", min: 1, max: 1, outcome: "Value" })],
    modifiers: [],
    regionIds: [],
    ...overrides,
  };
}

function makeProfile(config: Partial<NpcProfileConfig> = {}): NpcProfile {
  return {
    id: "prof1",
    campaignId: "camp1",
    name: "Test Profile",
    sortOrder: 0,
    config: {
      typeLabel: "Homeland",
      secondaryTypeLabel: "Class",
      typeTableId: null,
      secondaryTypeTableId: null,
      ageTableId: null,
      physicalTableIds: [],
      personalityTableIds: [],
      detailTableIds: [],
      ...config,
    },
  };
}

function stubRandom(...values: number[]) {
  const spy = vi.spyOn(Math, "random");
  for (const v of values) spy.mockReturnValueOnce(v);
  return spy;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── generateNpc — recipe capture ─────────────────────────────────────────────

describe("generateNpc — recipe capture", () => {
  it("attaches a recipe whose ids match the profile config and the resolved name table", () => {
    const profile = makeProfile({
      typeTableId: "tbl-type",
      secondaryTypeTableId: "tbl-sec",
      ageTableId: "tbl-age",
      physicalTableIds: ["tbl-phys1", "tbl-phys2"],
      personalityTableIds: ["tbl-pers1"],
      detailTableIds: [{ label: "Weapon", tableId: "tbl-weapon" }],
    });

    const tableMap = new Map<string, RandomTable>([
      ["tbl-type", makeTable({ id: "tbl-type", rows: [makeRow({ outcome: "Ruislip" })] })],
      ["tbl-sec", makeTable({ id: "tbl-sec", rows: [makeRow({ outcome: "Fighter" })] })],
      ["tbl-age", makeTable({ id: "tbl-age", rows: [makeRow({ outcome: "30" })] })],
      ["tbl-phys1", makeTable({ id: "tbl-phys1", rows: [makeRow({ outcome: "Scar" })] })],
      ["tbl-phys2", makeTable({ id: "tbl-phys2", rows: [makeRow({ outcome: "Tall" })] })],
      ["tbl-pers1", makeTable({ id: "tbl-pers1", rows: [makeRow({ outcome: "Grumpy" })] })],
      ["tbl-weapon", makeTable({ id: "tbl-weapon", rows: [makeRow({ outcome: "Sword" })] })],
      ["tbl-name", makeTable({ id: "tbl-name", npcForType: "Ruislip", rows: [makeRow({ outcome: "Bob" })] })],
    ]);

    const npc = generateNpc(profile, tableMap, "region1", "male", new Set());

    expect(npc.recipe).toBeDefined();
    expect(npc.recipe).toEqual({
      regionId: "region1",
      genderSelection: "male",
      typeTableId: "tbl-type",
      secondaryTypeTableId: "tbl-sec",
      ageTableId: "tbl-age",
      nameTableId: "tbl-name",
      physicalTableIds: ["tbl-phys1", "tbl-phys2"],
      personalityTableIds: ["tbl-pers1"],
      detailTables: [{ label: "Weapon", tableId: "tbl-weapon" }],
    });
  });

  it("returns npc unchanged from rerollNpc when it has no recipe (hydrated pre-feature data)", () => {
    const npc: GeneratedNpc = {
      name: "Old Name",
      gender: "male",
      age: null,
      type: null,
      typeLabel: "Homeland",
      secondaryType: null,
      secondaryTypeLabel: null,
      physical: [],
      personality: [],
      details: [],
    };
    expect(rerollNpc(npc, new Map())).toBe(npc);
    expect(rerollNpcField(npc, { kind: "name" }, new Map())).toBe(npc);
  });
});

// ─── rerollNpc — slot shape ───────────────────────────────────────────────────

describe("rerollNpc — preserves slot shape", () => {
  it("keeps the same labels, array lengths, and typeLabel after a re-roll", () => {
    const profile = makeProfile({
      typeTableId: "tbl-type",
      secondaryTypeTableId: "tbl-sec",
      ageTableId: "tbl-age",
      physicalTableIds: ["tbl-phys1", "tbl-phys2"],
      personalityTableIds: ["tbl-pers1"],
      detailTableIds: [{ label: "Weapon", tableId: "tbl-weapon" }],
    });

    const tableMap = new Map<string, RandomTable>([
      ["tbl-type", makeTable({ id: "tbl-type", rows: [makeRow({ outcome: "Ruislip" })] })],
      ["tbl-sec", makeTable({ id: "tbl-sec", rows: [makeRow({ outcome: "Fighter" })] })],
      ["tbl-age", makeTable({ id: "tbl-age", rows: [makeRow({ outcome: "30" })] })],
      ["tbl-phys1", makeTable({ id: "tbl-phys1", rows: [makeRow({ outcome: "Scar" })] })],
      ["tbl-phys2", makeTable({ id: "tbl-phys2", rows: [makeRow({ outcome: "Tall" })] })],
      ["tbl-pers1", makeTable({ id: "tbl-pers1", rows: [makeRow({ outcome: "Grumpy" })] })],
      ["tbl-weapon", makeTable({ id: "tbl-weapon", rows: [makeRow({ outcome: "Sword" })] })],
      ["tbl-name", makeTable({ id: "tbl-name", npcForType: "Ruislip", rows: [makeRow({ outcome: "Bob" })] })],
    ]);

    const npc = generateNpc(profile, tableMap, null, "male", new Set());
    const rerolled = rerollNpc(npc, tableMap);

    expect(rerolled.typeLabel).toBe(npc.typeLabel);
    expect(rerolled.secondaryTypeLabel).toBe(npc.secondaryTypeLabel);
    expect(rerolled.physical.length).toBe(npc.physical.length);
    expect(rerolled.personality.length).toBe(npc.personality.length);
    expect(rerolled.details.length).toBe(npc.details.length);
    expect(rerolled.details.map((d) => d.label)).toEqual(npc.details.map((d) => d.label));
  });
});

// ─── rerollNpc — gender replay (D4) ───────────────────────────────────────────

describe("rerollNpc — gender replay", () => {
  function makeBareNpc(genderSelection: "male" | "random"): GeneratedNpc {
    return {
      name: null,
      gender: "male",
      age: null,
      type: null,
      typeLabel: "Homeland",
      secondaryType: null,
      secondaryTypeLabel: null,
      physical: [],
      personality: [],
      details: [],
      recipe: {
        regionId: null,
        genderSelection,
        typeTableId: null,
        secondaryTypeTableId: null,
        ageTableId: null,
        nameTableId: null,
        physicalTableIds: [],
        personalityTableIds: [],
        detailTables: [],
      },
    };
  }

  it('with genderSelection "male" never yields female', () => {
    const npc = makeBareNpc("male");
    for (let i = 0; i < 10; i++) {
      expect(rerollNpc(npc, new Map()).gender).toBe("male");
    }
  });

  it('with genderSelection "random" can yield either', () => {
    const npc = makeBareNpc("random");

    stubRandom(0.1);
    expect(rerollNpc(npc, new Map()).gender).toBe("male");

    stubRandom(0.9);
    expect(rerollNpc(npc, new Map()).gender).toBe("female");
  });
});

// ─── rerollNpcField — type cascade (D5) ───────────────────────────────────────

describe("rerollNpcField — type cascade", () => {
  it("re-rolls the name when the new type resolves to a different name table", () => {
    const profile = makeProfile({ typeTableId: "tbl-type" });
    const tableMap = new Map<string, RandomTable>([
      [
        "tbl-type",
        makeTable({
          id: "tbl-type",
          diceExpression: "1d2",
          rows: [makeRow({ id: "r1", min: 1, max: 1, outcome: "Ruislip" }), makeRow({ id: "r2", min: 2, max: 2, outcome: "Talford" })],
        }),
      ],
      ["tbl-name-ruislip", makeTable({ id: "tbl-name-ruislip", npcForType: "Ruislip", rows: [makeRow({ outcome: "Ruislip Name" })] })],
      ["tbl-name-talford", makeTable({ id: "tbl-name-talford", npcForType: "Talford", rows: [makeRow({ outcome: "Talford Name" })] })],
    ]);

    stubRandom(0); // type roll -> 1 -> "Ruislip"
    const npc = generateNpc(profile, tableMap, null, "male", new Set());
    expect(npc.type).toBe("Ruislip");
    expect(npc.name).toBe("Ruislip Name");
    expect(npc.recipe?.nameTableId).toBe("tbl-name-ruislip");

    stubRandom(0.9); // type re-roll -> 2 -> "Talford"
    const rerolled = rerollNpcField(npc, { kind: "type" }, tableMap);

    expect(rerolled.type).toBe("Talford");
    expect(rerolled.name).toBe("Talford Name");
    expect(rerolled.recipe?.nameTableId).toBe("tbl-name-talford");
  });

  it("leaves the name intact when the new type resolves to the same name table", () => {
    const profile = makeProfile({ typeTableId: "tbl-type" });
    const tableMap = new Map<string, RandomTable>([
      [
        "tbl-type",
        makeTable({
          id: "tbl-type",
          diceExpression: "1d2",
          rows: [makeRow({ id: "r1", min: 1, max: 1, outcome: "Ruislip" }), makeRow({ id: "r2", min: 2, max: 2, outcome: "Talford" })],
        }),
      ],
      // One shared table serves both types.
      ["tbl-name-shared", makeTable({ id: "tbl-name-shared", npcForType: "Ruislip, Talford", rows: [makeRow({ outcome: "Shared Name" })] })],
    ]);

    stubRandom(0); // type roll -> 1 -> "Ruislip"
    const npc = generateNpc(profile, tableMap, null, "male", new Set());
    expect(npc.type).toBe("Ruislip");
    expect(npc.name).toBe("Shared Name");
    expect(npc.recipe?.nameTableId).toBe("tbl-name-shared");

    stubRandom(0.9); // type re-roll -> 2 -> "Talford"
    const rerolled = rerollNpcField(npc, { kind: "type" }, tableMap);

    expect(rerolled.type).toBe("Talford");
    expect(rerolled.name).toBe("Shared Name"); // untouched
    expect(rerolled.recipe?.nameTableId).toBe("tbl-name-shared");
  });
});

// ─── rerollNpc — missing table degrades per-field (D12) ───────────────────────

describe("rerollNpc — missing source table", () => {
  it("preserves the value verbatim for a field whose table was removed, while other fields still change", () => {
    const profile = makeProfile({
      physicalTableIds: ["tbl-phys1", "tbl-phys2"],
    });

    const fullTableMap = new Map<string, RandomTable>([
      ["tbl-name", makeTable({ id: "tbl-name", npcForGender: "male", rows: [makeRow({ outcome: "Bob" })] })],
      ["tbl-phys1", makeTable({ id: "tbl-phys1", rows: [makeRow({ outcome: "Scar" })] })],
      [
        "tbl-phys2",
        makeTable({
          id: "tbl-phys2",
          diceExpression: "1d2",
          rows: [makeRow({ id: "r1", min: 1, max: 1, outcome: "Short" }), makeRow({ id: "r2", min: 2, max: 2, outcome: "Tall" })],
        }),
      ],
    ]);

    stubRandom(0, 0, 0.1); // name(1d1), phys1(1d1), phys2(1d2 -> "Short")
    const npc = generateNpc(profile, fullTableMap, null, "male", new Set());
    expect(npc.physical).toEqual(["Scar", "Short"]);

    // Simulate tbl-phys1 having been deleted (or recategorized) since generation.
    const degradedTableMap = new Map(fullTableMap);
    degradedTableMap.delete("tbl-phys1");

    stubRandom(0, 0.9); // name(1d1), phys2(1d2 -> "Tall")
    const rerolled = rerollNpc(npc, degradedTableMap);

    expect(rerolled.physical[0]).toBe("Scar"); // preserved verbatim — table gone
    expect(rerolled.physical[1]).toBe("Tall"); // still rolled — table present
    expect(rerolled.physical[1]).not.toBe(npc.physical[1]);
  });
});

// ─── rerollNpc — region replay (D11) ──────────────────────────────────────────

describe("rerollNpc — uses the recipe's captured region, not any current region", () => {
  it("keeps applying an AUTO_REGION modifier that only fires for the original region", () => {
    const profile = makeProfile({ ageTableId: "tbl-age" });

    const ageTable = makeTable({
      id: "tbl-age",
      diceExpression: "1d1",
      rows: [makeRow({ id: "r1", min: 1, max: 1, outcome: "Young" }), makeRow({ id: "r2", min: 11, max: 11, outcome: "Old" })],
      modifiers: [makeModifier({ id: "m1", tableId: "tbl-age", behavior: "AUTO_REGION", autoRegionIds: ["region-A"], rollAdjustment: 10 })],
    });

    const tableMap = new Map<string, RandomTable>([
      ["tbl-age", ageTable],
      ["tbl-name", makeTable({ id: "tbl-name", rows: [makeRow({ outcome: "Bob" })] })],
    ]);

    // Generated while in region-A — the AUTO_REGION modifier fires.
    const npc = generateNpc(profile, tableMap, "region-A", "male", new Set());
    expect(npc.age).toBe("Old");
    expect(npc.recipe?.regionId).toBe("region-A");

    // rerollNpc has no "current region" input at all — it can only be using
    // recipe.regionId ("region-A"), so the modifier must still fire.
    const rerolled = rerollNpc(npc, tableMap);
    expect(rerolled.age).toBe("Old");
  });

  it("does not apply the modifier for an NPC generated outside the original region", () => {
    const profile = makeProfile({ ageTableId: "tbl-age" });

    const ageTable = makeTable({
      id: "tbl-age",
      diceExpression: "1d1",
      rows: [makeRow({ id: "r1", min: 1, max: 1, outcome: "Young" }), makeRow({ id: "r2", min: 11, max: 11, outcome: "Old" })],
      modifiers: [makeModifier({ id: "m1", tableId: "tbl-age", behavior: "AUTO_REGION", autoRegionIds: ["region-A"], rollAdjustment: 10 })],
    });

    const tableMap = new Map<string, RandomTable>([
      ["tbl-age", ageTable],
      ["tbl-name", makeTable({ id: "tbl-name", rows: [makeRow({ outcome: "Bob" })] })],
    ]);

    const npc = generateNpc(profile, tableMap, "region-B", "male", new Set());
    expect(npc.age).toBe("Young");

    const rerolled = rerollNpc(npc, tableMap);
    expect(rerolled.age).toBe("Young");
  });
});
