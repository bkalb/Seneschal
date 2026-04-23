import { describe, it, expect } from "vitest";
import { resolveGender } from "@/lib/npc/generator";

describe("resolveGender", () => {
  it("returns 'male' when explicitly selected", () => {
    expect(resolveGender("male")).toBe("male");
  });

  it("returns 'female' when explicitly selected", () => {
    expect(resolveGender("female")).toBe("female");
  });

  it("returns either 'male' or 'female' when 'random'", () => {
    const results = new Set(Array.from({ length: 50 }, () => resolveGender("random")));
    expect(results).toContain("male");
    expect(results).toContain("female");
    for (const r of results) {
      expect(["male", "female"]).toContain(r);
    }
  });
});
