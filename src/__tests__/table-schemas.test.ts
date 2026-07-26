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
