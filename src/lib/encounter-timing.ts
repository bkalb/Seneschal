export interface EncounterWindow {
  name: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

/** Roll a random minute within the window, accounting for cross-midnight wraps. */
export function rollEncounterTime(window: EncounterWindow): string {
  const startMin = window.startHour * 60 + window.startMinute;
  const endMin = window.endHour * 60 + window.endMinute;
  // Cross-midnight if end <= start (e.g. Night: 18:00–6:00)
  const duration = endMin > startMin
    ? endMin - startMin
    : 1440 - startMin + endMin;
  const picked = (startMin + Math.floor(Math.random() * duration)) % 1440;
  return formatMinutes(picked);
}

export function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

/** Parse a JSON string from the DB, returning [] on failure. */
export function parseEncounterWindows(json: string | null | undefined): EncounterWindow[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as EncounterWindow[];
  } catch {
    return [];
  }
}
