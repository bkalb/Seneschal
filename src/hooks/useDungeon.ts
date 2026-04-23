import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { EncounterSummary } from "./useCalendar";

// ─── Config ───────────────────────────────────────────────────────────────────

export interface DungeonConfig {
  turnsPerHour: number;
  encounterTurns: number[]; // 1-indexed turn numbers within each hour
}

export function useDungeonConfig(campaignId: string) {
  return useQuery<DungeonConfig>({
    queryKey: ["dungeon-config", campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/dungeon/config?campaignId=${campaignId}`);
      if (!res.ok) throw new Error("Failed to load dungeon config");
      return res.json();
    },
    enabled: !!campaignId,
  });
}

export function useSaveDungeonConfig(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: DungeonConfig) => {
      const res = await fetch("/api/dungeon/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, ...data }),
      });
      if (!res.ok) throw new Error("Failed to save dungeon config");
      return res.json() as Promise<DungeonConfig>;
    },
    onSuccess: (data) => qc.setQueryData(["dungeon-config", campaignId], data),
  });
}

// ─── Light sources ────────────────────────────────────────────────────────────

export interface LightSourceType {
  id: string;
  campaignId: string;
  name: string;
  defaultDuration: number;
  sortOrder: number;
}

export interface ActiveLightSource {
  id: string;
  campaignId: string;
  typeId: string | null;
  name: string;
  carrierName: string;
  remainingTurns: number;
  paused: boolean;
}

export interface LightSourceData {
  types: LightSourceType[];
  active: ActiveLightSource[];
}

export function useLightSources(campaignId: string) {
  return useQuery<LightSourceData>({
    queryKey: ["light-sources", campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/dungeon/light-sources?campaignId=${campaignId}`);
      if (!res.ok) throw new Error("Failed to load light sources");
      return res.json();
    },
    enabled: !!campaignId,
  });
}

export function useCreateLightSourceType(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, defaultDuration }: { name: string; defaultDuration: number }) => {
      const res = await fetch("/api/dungeon/light-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, name, defaultDuration }),
      });
      if (!res.ok) throw new Error("Failed to create light source type");
      return res.json() as Promise<LightSourceType>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["light-sources", campaignId] }),
  });
}

export function useUpdateLightSourceType(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, defaultDuration }: { id: string; name?: string; defaultDuration?: number }) => {
      const res = await fetch(`/api/dungeon/light-sources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "type", name, defaultDuration }),
      });
      if (!res.ok) throw new Error("Failed to update light source type");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["light-sources", campaignId] }),
  });
}

export function useDeleteLightSourceType(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/dungeon/light-sources/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete light source type");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["light-sources", campaignId] }),
  });
}

export function useActivateLightSource(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      typeId,
      name,
      carrierName,
      remainingTurns,
    }: {
      typeId?: string | null;
      name: string;
      carrierName: string;
      remainingTurns: number;
    }) => {
      const res = await fetch("/api/dungeon/light-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate", campaignId, typeId: typeId ?? null, name, carrierName, remainingTurns }),
      });
      if (!res.ok) throw new Error("Failed to activate light source");
      return res.json() as Promise<ActiveLightSource>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["light-sources", campaignId] }),
  });
}

export function useUpdateActiveLightSource(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      remainingTurns,
      paused,
      carrierName,
    }: {
      id: string;
      remainingTurns?: number;
      paused?: boolean;
      carrierName?: string;
    }) => {
      const res = await fetch(`/api/dungeon/light-sources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "active", remainingTurns, paused, carrierName }),
      });
      if (!res.ok) throw new Error("Failed to update light source");
      return res.json() as Promise<ActiveLightSource>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["light-sources", campaignId] }),
  });
}

export function useDeleteActiveLightSource(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/dungeon/light-sources/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove light source");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["light-sources", campaignId] }),
  });
}

// ─── Advance turn ─────────────────────────────────────────────────────────────

export interface AdvanceTurnResult {
  newTime: string;
  turnInHour: number;
  turnsPerHour: number;
  encounter: EncounterSummary | null;
  expiredLightSourceIds: string[];
}

export function useAdvanceTurn(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      currentTime,
      currentDungeonRegionId,
      encounterTableOverrideId,
    }: {
      currentTime: string;
      currentDungeonRegionId: string | null;
      encounterTableOverrideId?: string | null;
    }): Promise<AdvanceTurnResult> => {
      const res = await fetch("/api/dungeon/advance-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, currentTime, currentDungeonRegionId, encounterTableOverrideId }),
      });
      if (!res.ok) throw new Error("Failed to advance turn");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["light-sources", campaignId] });
    },
  });
}
