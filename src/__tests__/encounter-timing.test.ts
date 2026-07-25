import { describe, it, expect, afterEach, vi } from "vitest";
import {
  parseEncounterWindows,
  rollEncounterTime,
  formatMinutes,
  type EncounterWindow,
} from "@/lib/encounter-timing";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseEncounterWindows", () => {
  it("parses a valid JSON array", () => {
    const windows: EncounterWindow[] = [
      { name: "Day", startHour: 6, startMinute: 0, endHour: 18, endMinute: 0 },
    ];
    expect(parseEncounterWindows(JSON.stringify(windows))).toEqual(windows);
  });

  it("'[]' returns an empty array", () => {
    expect(parseEncounterWindows("[]")).toEqual([]);
  });

  it("null returns an empty array", () => {
    expect(parseEncounterWindows(null)).toEqual([]);
  });

  it("undefined returns an empty array", () => {
    expect(parseEncounterWindows(undefined)).toEqual([]);
  });

  it("malformed JSON never throws and returns an empty array", () => {
    expect(() => parseEncounterWindows("{not valid json")).not.toThrow();
    expect(parseEncounterWindows("{not valid json")).toEqual([]);
  });

  it("empty string never throws and returns an empty array", () => {
    expect(() => parseEncounterWindows("")).not.toThrow();
    expect(parseEncounterWindows("")).toEqual([]);
  });

  it("JSON of the wrong shape (a bare object) parses but is not an array — caller-facing shape is whatever JSON.parse returned", () => {
    // parseEncounterWindows does not validate shape beyond JSON.parse succeeding;
    // it casts via `as EncounterWindow[]`. Document current behavior: no throw,
    // and the parsed (non-array) value is returned as-is.
    expect(() => parseEncounterWindows('{"not":"an array"}')).not.toThrow();
    const result = parseEncounterWindows('{"not":"an array"}');
    expect(result).toEqual({ not: "an array" });
  });

  it("a JSON array of junk objects never throws", () => {
    expect(() => parseEncounterWindows('[{"junk":true},1,"str"]')).not.toThrow();
    const result = parseEncounterWindows('[{"junk":true},1,"str"]');
    expect(result).toEqual([{ junk: true }, 1, "str"]);
  });
});

describe("rollEncounterTime", () => {
  it("result falls within a non-wrapping window", () => {
    const window: EncounterWindow = { name: "Day", startHour: 6, startMinute: 0, endHour: 18, endMinute: 0 };
    for (const r of [0, 0.5, 0.999999]) {
      vi.spyOn(Math, "random").mockReturnValue(r);
      const time = rollEncounterTime(window);
      const [hm, period] = time.split(" ");
      const [hStr, mStr] = hm.split(":");
      let h = parseInt(hStr, 10) % 12;
      if (period === "PM") h += 12;
      const totalMin = h * 60 + parseInt(mStr, 10);
      expect(totalMin).toBeGreaterThanOrEqual(6 * 60);
      expect(totalMin).toBeLessThan(18 * 60);
      vi.restoreAllMocks();
    }
  });

  it("a midnight-wrapping window (18:00-06:00) yields a time in either tail, never the excluded middle", () => {
    const window: EncounterWindow = { name: "Night", startHour: 18, startMinute: 0, endHour: 6, endMinute: 0 };
    const startMin = 18 * 60;
    const excludedStart = 6 * 60; // 06:00
    const excludedEnd = 18 * 60; // 18:00

    for (const r of [0, 0.5, 0.999999]) {
      vi.spyOn(Math, "random").mockReturnValue(r);
      const time = rollEncounterTime(window);
      const [hm, period] = time.split(" ");
      const [hStr, mStr] = hm.split(":");
      let h = parseInt(hStr, 10) % 12;
      if (period === "PM") h += 12;
      const totalMin = h * 60 + parseInt(mStr, 10);
      // Valid range is [18:00, 24:00) union [00:00, 06:00) -> i.e. NOT in [06:00, 18:00).
      const inExcludedMiddle = totalMin >= excludedStart && totalMin < excludedEnd;
      expect(inExcludedMiddle).toBe(false);
      vi.restoreAllMocks();
    }
    void startMin;
  });

  it("random=0 picks the exact start of the window", () => {
    const window: EncounterWindow = { name: "Day", startHour: 6, startMinute: 0, endHour: 18, endMinute: 0 };
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(rollEncounterTime(window)).toBe(formatMinutes(6 * 60));
  });

  it("random just under 1 picks the last minute before the window's end", () => {
    const window: EncounterWindow = { name: "Day", startHour: 6, startMinute: 0, endHour: 18, endMinute: 0 };
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const duration = 18 * 60 - 6 * 60; // 720
    const picked = (6 * 60 + Math.floor(0.999999 * duration)) % 1440;
    expect(rollEncounterTime(window)).toBe(formatMinutes(picked));
  });

  it("midnight-wrapping window with random=0.5 picks a time within the wrapped duration", () => {
    const window: EncounterWindow = { name: "Night", startHour: 18, startMinute: 0, endHour: 6, endMinute: 0 };
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const duration = 1440 - 18 * 60 + 6 * 60; // 720
    const picked = (18 * 60 + Math.floor(0.5 * duration)) % 1440;
    expect(rollEncounterTime(window)).toBe(formatMinutes(picked));
  });
});

describe("formatMinutes", () => {
  it("midnight (0) formats as 12:00 AM", () => {
    expect(formatMinutes(0)).toBe("12:00 AM");
  });

  it("noon (720) formats as 12:00 PM", () => {
    expect(formatMinutes(12 * 60)).toBe("12:00 PM");
  });

  it("11:59 AM boundary, just before noon", () => {
    expect(formatMinutes(11 * 60 + 59)).toBe("11:59 AM");
  });

  it("12:01 PM boundary, just after noon", () => {
    expect(formatMinutes(12 * 60 + 1)).toBe("12:01 PM");
  });

  it("11:59 PM boundary, just before midnight", () => {
    expect(formatMinutes(23 * 60 + 59)).toBe("11:59 PM");
  });

  it("zero-pads single-digit minutes", () => {
    expect(formatMinutes(9 * 60 + 5)).toBe("9:05 AM");
  });
});
