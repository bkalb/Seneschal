export type CalendarDateString = string; // "YYYY-MM-DD"

export interface CalendarDate {
  year: number;
  month: number; // 1-based
  day: number;   // 1-based
}

export interface CalendarMonth {
  name: string;
  days: number;
}

export interface CalendarSeason {
  name: string;
  startMonth: number; // 1-based
  startDay: number;
  endMonth: number;
  endDay: number;
}

export interface IntercalaryPeriod {
  name: string;
  afterMonth: number; // inserted after this month (1-based)
  days: number;
  outsideWeeks: boolean; // if true, these days don't count toward weekday cycle
}

export interface Moon {
  id: string;
  name: string;
  cycleLength: number;
  referenceNewMoon: CalendarDateString;
}

export type MoonPhase =
  | "new"
  | "waxing_crescent"
  | "first_quarter"
  | "waxing_gibbous"
  | "full"
  | "waning_gibbous"
  | "last_quarter"
  | "waning_crescent";

export interface MoonPhaseResult {
  moon: Moon;
  phase: MoonPhase;
  dayInCycle: number; // 0-based day within the cycle
}

export interface CalendarConfig {
  id: string;
  campaignId: string;
  epochDate: CalendarDateString;
  months: CalendarMonth[];
  weekdays: string[];
  seasons: CalendarSeason[];
  intercalary: IntercalaryPeriod[];
  moons: Moon[];
}

export interface CalendarNote {
  id: string;
  campaignId: string;
  date: CalendarDateString;
  content: string; // TipTap JSON
}
