/**
 * Reader/writer for `CampaignState.todayWeatherJson`.
 *
 * This column stores the weather (CALENDAR-table) rolls for "today" so they
 * survive a page reload without re-rolling. Historically it was written as a
 * bare JSON array of rolls with no date attached, which made it impossible to
 * tell whether the stored value was actually rolled for the current in-game
 * date or was left over from a previous day (e.g. a day where no CALENDAR
 * table qualified, or the party moved to a region with no matching table).
 * A stale-but-non-empty value looked exactly like a valid one, so it could be
 * served indefinitely.
 *
 * The fix is to store a small envelope — `{ date, rolls }` — and require the
 * `date` to match the date being queried before the stored rolls are trusted.
 *
 * Any campaign whose `todayWeatherJson` was written before this change still
 * holds the legacy bare-array shape. `parseTodayWeather` recognizes that
 * shape and returns `date: null` for it: the rolls it contains cannot be
 * attributed to any particular date, so callers must treat it as stale (i.e.
 * recompute) rather than trusting it as "today's" weather. This also covers
 * `null`/empty storage and any malformed/unexpected JSON — all of it is
 * "unattributed" and therefore stale, and none of it should ever throw.
 */

export type WeatherRoll = { tableId: string; tableName: string; outcome: string; roll: number };

/** Envelope stored in CampaignState.todayWeatherJson. */
export type TodayWeather = { date: string; rolls: WeatherRoll[] };

function isWeatherRollArray(value: unknown): value is WeatherRoll[] {
  return Array.isArray(value);
}

/**
 * Tolerant reader. Returns date: null whenever the stored value cannot be
 * attributed to a known date — which callers must treat as stale.
 */
export function parseTodayWeather(json: string | null): { date: string | null; rolls: WeatherRoll[] } {
  if (!json) return { date: null, rolls: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { date: null, rolls: [] };
  }

  // Legacy shape: a bare array of rolls with no date attached.
  if (isWeatherRollArray(parsed)) {
    return { date: null, rolls: parsed };
  }

  // New envelope shape: { date, rolls }.
  if (
    parsed !== null &&
    typeof parsed === "object" &&
    "date" in parsed &&
    "rolls" in parsed &&
    typeof (parsed as { date: unknown }).date === "string" &&
    isWeatherRollArray((parsed as { rolls: unknown }).rolls)
  ) {
    const envelope = parsed as TodayWeather;
    return { date: envelope.date, rolls: envelope.rolls };
  }

  // Anything else (wrong-typed fields, unexpected object shape, etc.) is unattributed.
  return { date: null, rolls: [] };
}

export function serializeTodayWeather(date: string, rolls: WeatherRoll[]): string {
  const envelope: TodayWeather = { date, rolls };
  return JSON.stringify(envelope);
}
