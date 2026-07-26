import { describe, it, expect } from "vitest";
import { seasonFilterPasses } from "@/lib/tables/season-filter";

// Contract test: `RandomTable.seasonName` is stored as a comma-joined string
// (see TableEditModal's `selectedSeasons.join(",")` and the same convention
// now used by TableImportWizard's create payload). This verifies that format
// round-trips correctly through the same predicate the calendar
// advance/forecast routes use to decide whether a table auto-rolls.

describe("seasonFilterPasses", () => {
  it("passes any table with no seasonName configured", () => {
    expect(seasonFilterPasses({ seasonName: null, rollWhenNoSeason: "always" }, "Winter")).toBe(true);
    expect(seasonFilterPasses({ seasonName: null, rollWhenNoSeason: "skip" }, null)).toBe(true);
  });

  it("matches a single season written as a comma-joined string of one", () => {
    const table = { seasonName: "Spring", rollWhenNoSeason: "skip" };
    expect(seasonFilterPasses(table, "Spring")).toBe(true);
    expect(seasonFilterPasses(table, "Winter")).toBe(false);
  });

  it("matches any season in a multi-season comma-joined selection", () => {
    const table = { seasonName: "Spring,Summer", rollWhenNoSeason: "skip" };
    expect(seasonFilterPasses(table, "Spring")).toBe(true);
    expect(seasonFilterPasses(table, "Summer")).toBe(true);
    expect(seasonFilterPasses(table, "Autumn")).toBe(false);
  });

  it("trims whitespace around comma-joined season names", () => {
    const table = { seasonName: "Spring, Summer", rollWhenNoSeason: "skip" };
    expect(seasonFilterPasses(table, "Summer")).toBe(true);
  });

  it("falls back to rollWhenNoSeason when the active season is unknown", () => {
    const table = { seasonName: "Spring,Summer", rollWhenNoSeason: "always" };
    expect(seasonFilterPasses(table, null)).toBe(true);
    expect(seasonFilterPasses({ ...table, rollWhenNoSeason: "skip" }, null)).toBe(false);
  });

  it("falls back to rollWhenNoSeason when the active season doesn't match", () => {
    const table = { seasonName: "Spring,Summer", rollWhenNoSeason: "always" };
    expect(seasonFilterPasses(table, "Winter")).toBe(true);
    expect(seasonFilterPasses({ ...table, rollWhenNoSeason: "skip" }, "Winter")).toBe(false);
  });
});
