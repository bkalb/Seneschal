import { describe, it, expect } from "vitest";
import { createTableSchema } from "@/lib/tables/table-schemas";

// Regression test for the "Seasons" multi-select in TableImportWizard silently
// discarding the GM's selection: createSchema in POST /api/random-tables used
// to omit `seasonName` (and `rollWhenNoSeason`), so zod stripped them before
// the row ever reached prisma.randomTable.create(). See TableEditModal's PATCH
// payload and updateSchema in src/app/api/random-tables/[id]/route.ts for the
// shape these fields must match.

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    campaignId: "camp1",
    name: "Random Weather",
    category: "CALENDAR",
    diceExpression: "1d8",
    rows: [{ min: 1, max: 8, outcome: "Clear" }],
    ...overrides,
  };
}

describe("createTableSchema (POST /api/random-tables)", () => {
  it("accepts and preserves a comma-joined seasonName", () => {
    const parsed = createTableSchema.safeParse(
      basePayload({ seasonName: "Spring,Summer" })
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.seasonName).toBe("Spring,Summer");
    }
  });

  it("accepts seasonName: null (no season filter)", () => {
    const parsed = createTableSchema.safeParse(basePayload({ seasonName: null }));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.seasonName).toBeNull();
    }
  });

  it("accepts and preserves rollWhenNoSeason", () => {
    const parsed = createTableSchema.safeParse(
      basePayload({ seasonName: "Winter", rollWhenNoSeason: "skip" })
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.rollWhenNoSeason).toBe("skip");
    }
  });

  it("rejects an invalid rollWhenNoSeason value", () => {
    const parsed = createTableSchema.safeParse(
      basePayload({ rollWhenNoSeason: "sometimes" })
    );
    expect(parsed.success).toBe(false);
  });

  it("omits seasonName/rollWhenNoSeason when not provided (falls back to prisma defaults)", () => {
    const parsed = createTableSchema.safeParse(basePayload());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.seasonName).toBeUndefined();
      expect(parsed.data.rollWhenNoSeason).toBeUndefined();
    }
  });
});

// Regression test for the import wizard silently dropping `applicableModes`
// and the `prerequisite*` trio: createSchema in POST /api/random-tables used
// to omit them, so zod stripped them before the row ever reached
// prisma.randomTable.create(). See TableEditModal's PATCH payload and
// updateSchema in src/app/api/random-tables/[id]/route.ts for the shape
// these fields must match. `applicableModes` is `String @default("BOTH")`
// and non-null in Prisma, so it uses `.default()` rather than `.nullable()`.

describe("createTableSchema — applicableModes", () => {
  it("accepts and preserves an explicit applicableModes value", () => {
    const parsed = createTableSchema.safeParse(
      basePayload({ applicableModes: "DUNGEON" })
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.applicableModes).toBe("DUNGEON");
    }
  });

  it("defaults applicableModes to BOTH when omitted", () => {
    const parsed = createTableSchema.safeParse(basePayload());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.applicableModes).toBe("BOTH");
    }
  });

  it("rejects an invalid applicableModes value", () => {
    const parsed = createTableSchema.safeParse(
      basePayload({ applicableModes: "OVERWORLD" })
    );
    expect(parsed.success).toBe(false);
  });
});

describe("createTableSchema — prerequisite trio", () => {
  it("accepts and preserves prerequisiteDice/Min/Max", () => {
    const parsed = createTableSchema.safeParse(
      basePayload({ prerequisiteDice: "1d6", prerequisiteMin: 1, prerequisiteMax: 3 })
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.prerequisiteDice).toBe("1d6");
      expect(parsed.data.prerequisiteMin).toBe(1);
      expect(parsed.data.prerequisiteMax).toBe(3);
    }
  });

  it("accepts null for the prerequisite trio (no prerequisite check)", () => {
    const parsed = createTableSchema.safeParse(
      basePayload({ prerequisiteDice: null, prerequisiteMin: null, prerequisiteMax: null })
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.prerequisiteDice).toBeNull();
      expect(parsed.data.prerequisiteMin).toBeNull();
      expect(parsed.data.prerequisiteMax).toBeNull();
    }
  });

  it("omits the prerequisite trio when not provided", () => {
    const parsed = createTableSchema.safeParse(basePayload());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.prerequisiteDice).toBeUndefined();
      expect(parsed.data.prerequisiteMin).toBeUndefined();
      expect(parsed.data.prerequisiteMax).toBeUndefined();
    }
  });

  it("rejects a non-integer prerequisiteMin", () => {
    const parsed = createTableSchema.safeParse(
      basePayload({ prerequisiteMin: 1.5 })
    );
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-integer prerequisiteMax", () => {
    const parsed = createTableSchema.safeParse(
      basePayload({ prerequisiteMax: 2.5 })
    );
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-string prerequisiteDice", () => {
    const parsed = createTableSchema.safeParse(
      basePayload({ prerequisiteDice: 6 })
    );
    expect(parsed.success).toBe(false);
  });
});
