import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CalendarConfig, CalendarNote } from "@/types/calendar";

// ─── Config ───────────────────────────────────────────────────────────────────

export function useCalendarConfig(campaignId: string) {
  return useQuery<CalendarConfig | null>({
    queryKey: ["calendar-config", campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/config?campaignId=${campaignId}`);
      if (!res.ok) throw new Error("Failed to fetch calendar config");
      return res.json();
    },
    enabled: !!campaignId,
  });
}

export function useSaveCalendarConfig(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<CalendarConfig, "id"> & { campaignId: string }) => {
      const payload = {
        campaignId,
        epochDate: data.epochDate,
        monthsJson: JSON.stringify(data.months),
        weekdaysJson: JSON.stringify(data.weekdays),
        seasonsJson: JSON.stringify(data.seasons),
        intercalaryJson: data.intercalary.length > 0 ? JSON.stringify(data.intercalary) : null,
        moons: data.moons,
      };
      const res = await fetch("/api/calendar/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save calendar config");
      return res.json() as Promise<CalendarConfig>;
    },
    onSuccess: (data) => qc.setQueryData(["calendar-config", campaignId], data),
  });
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export function useCalendarNotes(campaignId: string, date?: string) {
  return useQuery<CalendarNote[]>({
    queryKey: ["calendar-notes", campaignId, date ?? "all"],
    queryFn: async () => {
      const url = new URL("/api/calendar/notes", window.location.origin);
      url.searchParams.set("campaignId", campaignId);
      if (date) url.searchParams.set("date", date);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch notes");
      return res.json();
    },
    enabled: !!campaignId,
  });
}

export function useCreateCalendarNote(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ date, content }: { date: string; content: string }) => {
      const res = await fetch("/api/calendar/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, date, content }),
      });
      if (!res.ok) throw new Error("Failed to create note");
      return res.json() as Promise<CalendarNote>;
    },
    onSuccess: (note) => {
      qc.invalidateQueries({ queryKey: ["calendar-notes", campaignId, note.date] });
      qc.invalidateQueries({ queryKey: ["calendar-notes", campaignId, "all"] });
    },
  });
}

export function useUpdateCalendarNote(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const res = await fetch(`/api/calendar/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to update note");
      return res.json() as Promise<CalendarNote>;
    },
    onSuccess: (note) => {
      qc.invalidateQueries({ queryKey: ["calendar-notes", campaignId, note.date] });
      qc.invalidateQueries({ queryKey: ["calendar-notes", campaignId, "all"] });
    },
  });
}

export function useDeleteCalendarNote(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const res = await fetch(`/api/calendar/notes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete note");
      return date;
    },
    onSuccess: (date) => {
      qc.invalidateQueries({ queryKey: ["calendar-notes", campaignId, date] });
      qc.invalidateQueries({ queryKey: ["calendar-notes", campaignId, "all"] });
    },
  });
}

// ─── Set current date ─────────────────────────────────────────────────────────

export function useSetCurrentDate(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (date: string) => {
      const res = await fetch("/api/campaign-state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, currentDate: date }),
      });
      if (!res.ok) throw new Error("Failed to set date");
      return date;
    },
    onSuccess: (date) => {
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
      qc.setQueryData(["current-date", campaignId], date);
    },
  });
}

// ─── Advance day ──────────────────────────────────────────────────────────────

export interface DailyRollResult {
  tableId: string;
  tableName: string;
  outcome: string;
  roll: number;
}

export interface EncounterSummary {
  label: string;
  time: string | null;
  outcome: string;
  roll: number;
  reaction: { tableName: string; roll: number; outcome: string } | null;
  surprise: { surprised: boolean; dice: string; roll: number; threshold: number } | null;
}

export interface AdvanceDayResult {
  newDate: string;
  dailyRolls: DailyRollResult[];
  forecastRolls: DailyRollResult[];
  dayEncounter: EncounterSummary | null;
  nightEncounter: EncounterSummary | null;
}

export function useAdvanceDay(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      currentRegionId,
      userToggles = [],
      encounterTableOverrideId = null,
    }: {
      currentRegionId: string | null;
      userToggles?: string[];
      encounterTableOverrideId?: string | null;
    }): Promise<AdvanceDayResult> => {
      const res = await fetch("/api/calendar/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, currentRegionId, userToggles, encounterTableOverrideId }),
      });
      if (!res.ok) throw new Error("Failed to advance day");
      return res.json();
    },
    onSuccess: ({ newDate }) => {
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
      qc.invalidateQueries({ queryKey: ["calendar-notes", campaignId, "all"] });
      qc.setQueryData(["current-date", campaignId], newDate);
    },
  });
}

export interface RegionRerollResult {
  weatherRolls: DailyRollResult[];
  dayEncounter: EncounterSummary | null;
  nightEncounter: EncounterSummary | null;
}

export function useRerollForRegion(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      regionId,
      regionName,
      currentDate,
      encounterTableOverrideId = null,
    }: {
      regionId: string;
      regionName: string;
      currentDate: string;
      encounterTableOverrideId?: string | null;
    }): Promise<RegionRerollResult> => {
      const res = await fetch("/api/calendar/reroll-region", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, regionId, regionName, currentDate, encounterTableOverrideId }),
      });
      if (!res.ok) throw new Error("Failed to reroll for region");
      return res.json();
    },
    onSuccess: (_data, { currentDate }) => {
      qc.invalidateQueries({ queryKey: ["calendar-notes", campaignId, "all"] });
      qc.invalidateQueries({ queryKey: ["calendar-notes", campaignId, currentDate] });
    },
  });
}

// ─── Forecasting mode toggle ──────────────────────────────────────────────────

export function useToggleForecastingMode(campaignId: string) {
  return useMutation({
    mutationFn: async (forecastingMode: boolean) => {
      const res = await fetch("/api/campaign-state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, forecastingMode }),
      });
      if (!res.ok) throw new Error("Failed to update forecasting mode");
      return forecastingMode;
    },
  });
}

// ─── Fetch stored forecast rolls ───────────────────────────────────────────

export function useFetchForecastRolls(campaignId: string) {
  return useQuery<DailyRollResult[]>({
    queryKey: ["forecast-rolls", campaignId],
    queryFn: async ({ queryKey }: { queryKey: readonly unknown[] }) => {
      // This will be called with params injected by the component
      const res = await fetch(queryKey[2] as string);
      if (!res.ok) throw new Error("Failed to fetch forecast rolls");
      const data = await res.json();
      return data.forecastRolls ?? [];
    },
    enabled: false, // Manual trigger only
  });
}

export function useGetForecastRolls(campaignId: string) {
  return useMutation({
    mutationFn: async ({
      currentRegionId,
      currentDate,
      encounterTableOverrideId = null,
    }: {
      currentRegionId: string;
      currentDate: string;
      encounterTableOverrideId?: string | null;
    }): Promise<{
      todayRolls: DailyRollResult[];
      forecastRolls: DailyRollResult[];
      dayEncounter: EncounterSummary | null;
      nightEncounter: EncounterSummary | null;
    }> => {
      const url = new URL("/api/calendar/forecast", window.location.origin);
      url.searchParams.set("campaignId", campaignId);
      url.searchParams.set("currentRegionId", currentRegionId);
      url.searchParams.set("currentDate", currentDate);
      if (encounterTableOverrideId) url.searchParams.set("encounterTableOverrideId", encounterTableOverrideId);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch forecast rolls");
      const data = await res.json();
      return {
        todayRolls: data.todayRolls ?? [],
        forecastRolls: data.forecastRolls ?? [],
        dayEncounter: data.dayEncounter ?? null,
        nightEncounter: data.nightEncounter ?? null,
      };
    },
  });
}
