import { describe, it, expect } from "vitest";
import { parseTodayWeather, serializeTodayWeather, type WeatherRoll } from "@/lib/calendar/today-weather";

const sampleRolls: WeatherRoll[] = [
  { tableId: "t1", tableName: "Weather", outcome: "Rain", roll: 7 },
  { tableId: "t2", tableName: "Wind", outcome: "Breezy", roll: 3 },
];

describe("parseTodayWeather", () => {
  it("returns date: null and empty rolls for null input", () => {
    expect(parseTodayWeather(null)).toEqual({ date: null, rolls: [] });
  });

  it("returns date: null and empty rolls for empty string input", () => {
    expect(parseTodayWeather("")).toEqual({ date: null, rolls: [] });
  });

  it("treats a legacy bare array as unattributed (date: null) but preserves the rolls", () => {
    const legacyJson = JSON.stringify(sampleRolls);
    const result = parseTodayWeather(legacyJson);
    expect(result.date).toBeNull();
    expect(result.rolls).toEqual(sampleRolls);
  });

  it("treats a legacy empty bare array as unattributed", () => {
    const result = parseTodayWeather(JSON.stringify([]));
    expect(result.date).toBeNull();
    expect(result.rolls).toEqual([]);
  });

  it("parses the new envelope shape and returns the attributed date", () => {
    const json = JSON.stringify({ date: "0100-05-12", rolls: sampleRolls });
    const result = parseTodayWeather(json);
    expect(result.date).toBe("0100-05-12");
    expect(result.rolls).toEqual(sampleRolls);
  });

  it("returns date: null for malformed JSON without throwing", () => {
    expect(() => parseTodayWeather("{not valid json")).not.toThrow();
    expect(parseTodayWeather("{not valid json")).toEqual({ date: null, rolls: [] });
  });

  it("returns date: null when the object is missing the rolls field", () => {
    const json = JSON.stringify({ date: "0100-05-12" });
    expect(parseTodayWeather(json)).toEqual({ date: null, rolls: [] });
  });

  it("returns date: null when the object is missing the date field", () => {
    const json = JSON.stringify({ rolls: sampleRolls });
    expect(parseTodayWeather(json)).toEqual({ date: null, rolls: [] });
  });

  it("returns date: null when date is wrong-typed (e.g. a number)", () => {
    const json = JSON.stringify({ date: 12345, rolls: sampleRolls });
    expect(parseTodayWeather(json)).toEqual({ date: null, rolls: [] });
  });

  it("returns date: null when rolls is wrong-typed (e.g. not an array)", () => {
    const json = JSON.stringify({ date: "0100-05-12", rolls: "not-an-array" });
    expect(parseTodayWeather(json)).toEqual({ date: null, rolls: [] });
  });

  it("returns date: null for an unrelated JSON object shape", () => {
    const json = JSON.stringify({ foo: "bar" });
    expect(parseTodayWeather(json)).toEqual({ date: null, rolls: [] });
  });

  it("returns date: null for a bare JSON primitive", () => {
    expect(parseTodayWeather(JSON.stringify(42))).toEqual({ date: null, rolls: [] });
    expect(parseTodayWeather(JSON.stringify("hello"))).toEqual({ date: null, rolls: [] });
    expect(parseTodayWeather(JSON.stringify(null))).toEqual({ date: null, rolls: [] });
  });
});

describe("serializeTodayWeather", () => {
  it("round-trips through parseTodayWeather", () => {
    const json = serializeTodayWeather("0100-05-12", sampleRolls);
    const result = parseTodayWeather(json);
    expect(result).toEqual({ date: "0100-05-12", rolls: sampleRolls });
  });

  it("round-trips an empty rolls array (the 'nothing qualified today' case)", () => {
    const json = serializeTodayWeather("0100-05-12", []);
    const result = parseTodayWeather(json);
    expect(result).toEqual({ date: "0100-05-12", rolls: [] });
  });

  it("output is always accepted (never falls back to unattributed) by parseTodayWeather", () => {
    const json = serializeTodayWeather("0001-01-01", sampleRolls);
    expect(parseTodayWeather(json).date).toBe("0001-01-01");
  });
});
