import { describe, it, expect } from "vitest";
import {
  parseDiceExpression,
  rollExpression,
  isValidDiceExpression,
} from "@/lib/dice/roller";

describe("rollExpression", () => {
  it("d20 rolls a single d20", () => {
    const result = rollExpression("d20");
    expect(result.expression.count).toBe(1);
    expect(result.expression.sides).toBe(20);
    expect(result.rolls).toHaveLength(1);
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.total).toBeLessThanOrEqual(20);
  });

  it("d% rolls a d100", () => {
    const result = rollExpression("d%");
    expect(result.expression.count).toBe(1);
    expect(result.expression.sides).toBe(100);
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it("2d6+1 stays within [3, 13]", () => {
    for (let i = 0; i < 50; i++) {
      const result = rollExpression("2d6+1");
      expect(result.total).toBeGreaterThanOrEqual(3);
      expect(result.total).toBeLessThanOrEqual(13);
    }
  });

  it("4d6kh3 drops the lowest die and totals within [3, 18]", () => {
    for (let i = 0; i < 50; i++) {
      const result = rollExpression("4d6kh3");
      expect(result.rolls).toHaveLength(4);
      expect(result.kept).toHaveLength(3);
      expect(result.total).toBeGreaterThanOrEqual(3);
      expect(result.total).toBeLessThanOrEqual(18);

      const sortedRolls = [...result.rolls].sort((a, b) => a - b);
      const dropped = sortedRolls[0];
      const expectedKept = [...result.rolls].sort((a, b) => a - b).slice(1);
      expect(result.kept.reduce((a, b) => a + b, 0)).toBe(
        expectedKept.reduce((a, b) => a + b, 0)
      );
      expect(result.total).toBe(expectedKept.reduce((a, b) => a + b, 0));
      void dropped;
    }
  });

  it("garbage input never throws and yields a zero-sentinel", () => {
    expect(() => rollExpression("garbage")).not.toThrow();
    const result = rollExpression("garbage");
    expect(result.expression.sides).toBe(0);
    expect(result.total).toBe(0);
    expect(result.rolls).toEqual([]);
    expect(result.kept).toEqual([]);
  });

  it("parseDiceExpression returns null (not a throw) on no-match", () => {
    expect(() => parseDiceExpression("garbage")).not.toThrow();
    expect(parseDiceExpression("garbage")).toBeNull();
    expect(parseDiceExpression("")).toBeNull();
  });

  it("isValidDiceExpression reflects the tolerant grammar", () => {
    expect(isValidDiceExpression("d20")).toBe(true);
    expect(isValidDiceExpression("1d6+2")).toBe(true);
    expect(isValidDiceExpression("d%")).toBe(true);
    expect(isValidDiceExpression("4d6kh3")).toBe(true);
    expect(isValidDiceExpression("4d6kl")).toBe(true);
    expect(isValidDiceExpression("garbage")).toBe(false);
    expect(isValidDiceExpression("0d6")).toBe(false);
    expect(isValidDiceExpression("1d0")).toBe(false);
  });
});
