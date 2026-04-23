import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CombatCombatantData {
  id: string;
  sideId: string;
  name: string;
  sortOrder: number;
  ac: number;
  hd: string;
  maxHp: number;
  currentHp: number;
  attackBonus: number;
  attackDamage: string;
  notes: string | null;
  updatedAt: string;
}

export interface CombatSideData {
  id: string;
  encounterId: string;
  name: string;
  sortOrder: number;
  actedThisRound: boolean;
  isPlayerSide: boolean;
  combatants: CombatCombatantData[];
}

export interface CombatEncounterData {
  id: string;
  campaignId: string;
  name: string | null;
  isActive: boolean;
  currentRound: number;
  createdAt: string;
  updatedAt: string;
  sides: CombatSideData[];
}

export interface AddSidePayload {
  encounterId: string;
  name: string;
  count: number;
  ac: number;
  hd: string;
  maxHp?: number;
  maxHps?: number[];
  attackBonus: number;
  attackDamage: string;
  traitTableId?: string;
  traitCount?: number;
}

export interface AddCombatantPayload {
  sideId: string;
  name: string;
  count?: number;
  ac: number;
  hd: string;
  maxHp?: number;
  maxHps?: number[];
  attackBonus: number;
  attackDamage: string;
}

export interface PatchCombatantPayload {
  id: string;
  name?: string;
  currentHp?: number;
  maxHp?: number;
  ac?: number;
  hd?: string;
  attackBonus?: number;
  attackDamage?: string;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchActiveEncounter(campaignId: string): Promise<CombatEncounterData | null> {
  const res = await fetch(`/api/combat-encounter?campaignId=${campaignId}`);
  if (!res.ok) throw new Error("Failed to fetch combat encounter");
  return res.json();
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useCombatEncounter(campaignId: string) {
  return useQuery({
    queryKey: ["combat-encounter", campaignId],
    queryFn: () => fetchActiveEncounter(campaignId),
    enabled: !!campaignId,
  });
}

export function useStartEncounter(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string | undefined = undefined): Promise<CombatEncounterData> => {
      const res = await fetch("/api/combat-encounter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, name: name ?? null }),
      });
      if (!res.ok) throw new Error("Failed to start encounter");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["combat-encounter", campaignId] }),
  });
}

export function useEndEncounter(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (encounterId: string): Promise<void> => {
      const res = await fetch(`/api/combat-encounter/${encounterId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to end encounter");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["combat-encounter", campaignId] }),
  });
}

export function useAddSide(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AddSidePayload): Promise<CombatSideData> => {
      const res = await fetch("/api/combat-side", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to add side");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["combat-encounter", campaignId] }),
  });
}

export function useAddCombatant(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sideId, ...rest }: AddCombatantPayload): Promise<CombatCombatantData | CombatCombatantData[]> => {
      const res = await fetch(`/api/combat-side/${sideId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rest),
      });
      if (!res.ok) throw new Error("Failed to add combatant");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["combat-encounter", campaignId] }),
  });
}

export function usePatchCombatant(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...rest }: PatchCombatantPayload): Promise<CombatCombatantData> => {
      const res = await fetch(`/api/combat-combatant/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rest),
      });
      if (!res.ok) throw new Error("Failed to update combatant");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["combat-encounter", campaignId] }),
  });
}

export function useDeleteCombatant(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/combat-combatant/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete combatant");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["combat-encounter", campaignId] }),
  });
}

export function useDeleteSide(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sideId: string): Promise<void> => {
      const res = await fetch(`/api/combat-side/${sideId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete side");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["combat-encounter", campaignId] }),
  });
}

export function usePatchCombatSide(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...rest }: { id: string; name?: string; actedThisRound?: boolean; sortOrder?: number }): Promise<CombatSideData> => {
      const res = await fetch(`/api/combat-side/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rest),
      });
      if (!res.ok) throw new Error("Failed to update side");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["combat-encounter", campaignId] }),
  });
}

export function useAdvanceRound(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (encounterId: string): Promise<CombatEncounterData> => {
      const res = await fetch(`/api/combat-encounter/${encounterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance-round" }),
      });
      if (!res.ok) throw new Error("Failed to advance round");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["combat-encounter", campaignId] }),
  });
}
