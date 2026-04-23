import type { Moon, MoonPhase, MoonPhaseResult, CalendarDate, CalendarConfig } from "@/types/calendar";
import { dateToAbsoluteDays, parseDate } from "./engine";

const PHASE_NAMES: MoonPhase[] = [
  "new",
  "waxing_crescent",
  "first_quarter",
  "waxing_gibbous",
  "full",
  "waning_gibbous",
  "last_quarter",
  "waning_crescent",
];

export function computeMoonPhase(
  date: CalendarDate,
  moon: Moon,
  config: CalendarConfig
): MoonPhaseResult {
  const dateAbs = dateToAbsoluteDays(date, config);
  const refAbs = dateToAbsoluteDays(parseDate(moon.referenceNewMoon), config);

  // Positive modulo to handle dates before the reference new moon
  const dayInCycle =
    ((dateAbs - refAbs) % moon.cycleLength + moon.cycleLength) % moon.cycleLength;

  const phaseIndex = Math.floor((dayInCycle / moon.cycleLength) * PHASE_NAMES.length);
  const phase = PHASE_NAMES[Math.min(phaseIndex, PHASE_NAMES.length - 1)];

  return { moon, phase, dayInCycle };
}

export function computeAllMoonPhases(
  date: CalendarDate,
  config: CalendarConfig
): MoonPhaseResult[] {
  return config.moons.map((moon) => computeMoonPhase(date, moon, config));
}
