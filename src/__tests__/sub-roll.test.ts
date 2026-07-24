import { describe, it, expect } from "vitest";
import { detectAndResolveSubRolls } from "@/lib/tables/sub-roll";
import type { TableRow } from "@/types/table";

const rows: TableRow[] = [
  { id: "r1", tableId: "t1", min: 1, max: 3, outcome: "Goblins" },
  { id: "r2", tableId: "t1", min: 4, max: 6, outcome: "Orcs" },
];

describe("detectAndResolveSubRolls", () => {
  it("derives an explicit count from 'for each of the N X' phrasing", () => {
    const subRolls = detectAndResolveSubRolls("roll a d6 for each of the 3 groups", rows);
    expect(subRolls).toHaveLength(1);
    expect(subRolls[0].notation).toBe("d6");
    expect(subRolls[0].results).toHaveLength(3);
    expect(subRolls[0].label).toBe("each 3 groups");
  });

  it("falls back to DEFAULT_FOR_EACH_COUNT (2) for 'for each side' with no number", () => {
    const subRolls = detectAndResolveSubRolls("roll a d20 for each side", rows);
    expect(subRolls).toHaveLength(1);
    expect(subRolls[0].notation).toBe("d20");
    expect(subRolls[0].results).toHaveLength(2);
    expect(subRolls[0].label).toBe("each side");
  });

  it("clamps a pathological explicit count to the [1, 20] range", () => {
    const subRolls = detectAndResolveSubRolls("roll a d6 for each of the 999 groups", rows);
    expect(subRolls).toHaveLength(1);
    expect(subRolls[0].results).toHaveLength(20);
  });

  it("still handles a bare 'roll dN' with a single roll and no label", () => {
    const subRolls = detectAndResolveSubRolls("roll a d20", rows);
    expect(subRolls).toHaveLength(1);
    expect(subRolls[0].notation).toBe("d20");
    expect(subRolls[0].results).toHaveLength(1);
    expect(subRolls[0].label).toBeNull();
  });
});
