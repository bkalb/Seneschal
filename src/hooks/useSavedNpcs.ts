import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SavedNpcData, NpcAffiliationData } from "@/types/savedNpc";
import type { GeneratedNpc } from "@/types/npc";

// ─── Query params ─────────────────────────────────────────────────────────────

export interface SavedNpcFilters {
  search?: string;
  affiliationId?: string;
  status?: "all" | "alive" | "deceased";
  sortBy?: "name" | "type" | "createdAt";
  sortDir?: "asc" | "desc";
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchSavedNpcs(campaignId: string, filters: SavedNpcFilters): Promise<SavedNpcData[]> {
  const p = new URLSearchParams({ campaignId });
  if (filters.search) p.set("search", filters.search);
  if (filters.affiliationId) p.set("affiliationId", filters.affiliationId);
  if (filters.status && filters.status !== "all") p.set("status", filters.status);
  if (filters.sortBy) p.set("sortBy", filters.sortBy);
  if (filters.sortDir) p.set("sortDir", filters.sortDir);
  const res = await fetch(`/api/saved-npc?${p}`);
  if (!res.ok) throw new Error("Failed to fetch saved NPCs");
  return res.json();
}

async function fetchAffiliations(campaignId: string): Promise<NpcAffiliationData[]> {
  const res = await fetch(`/api/npc-affiliation?campaignId=${campaignId}`);
  if (!res.ok) throw new Error("Failed to fetch affiliations");
  return res.json();
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useSavedNpcs(campaignId: string, filters: SavedNpcFilters = {}) {
  return useQuery({
    queryKey: ["saved-npcs", campaignId, filters],
    queryFn: () => fetchSavedNpcs(campaignId, filters),
    enabled: !!campaignId,
  });
}

export function useNpcAffiliations(campaignId: string) {
  return useQuery({
    queryKey: ["npc-affiliations", campaignId],
    queryFn: () => fetchAffiliations(campaignId),
    enabled: !!campaignId,
  });
}

export interface CombatantStats {
  isCombatant?: boolean;
  combatAc?: number | null;
  combatHd?: string | null;
  combatMaxHp?: number | null;
  combatAttackBonus?: number | null;
  combatAttackDamage?: string | null;
}

export function useSaveSingleNpc(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (npc: GeneratedNpc & { affiliationId?: string | null } & CombatantStats): Promise<SavedNpcData> => {
      const res = await fetch("/api/saved-npc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          name: npc.name,
          gender: npc.gender,
          age: npc.age,
          type: npc.type,
          typeLabel: npc.typeLabel,
          secondaryType: npc.secondaryType,
          secondaryTypeLabel: npc.secondaryTypeLabel,
          physical: npc.physical,
          personality: npc.personality,
          details: npc.details,
          affiliationId: npc.affiliationId ?? null,
          isCombatant: npc.isCombatant ?? false,
          combatAc: npc.combatAc ?? null,
          combatHd: npc.combatHd ?? null,
          combatMaxHp: npc.combatMaxHp ?? null,
          combatAttackBonus: npc.combatAttackBonus ?? null,
          combatAttackDamage: npc.combatAttackDamage ?? null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save NPC");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-npcs", campaignId] }),
  });
}

export function useSaveBatchNpcs(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      npcs: GeneratedNpc[];
      affiliationName?: string;
    }): Promise<SavedNpcData[]> => {
      const res = await fetch("/api/saved-npc/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          affiliationName: args.affiliationName,
          npcs: args.npcs.map((npc) => ({
            name: npc.name,
            gender: npc.gender,
            age: npc.age,
            type: npc.type,
            typeLabel: npc.typeLabel,
            secondaryType: npc.secondaryType,
            secondaryTypeLabel: npc.secondaryTypeLabel,
            physical: npc.physical,
            personality: npc.personality,
            details: npc.details,
          })),
        }),
      });
      if (!res.ok) throw new Error("Failed to save batch");
      return res.json();
    },
    onSuccess: (data) => {
      // If a new affiliation was created, invalidate that list too
      qc.invalidateQueries({ queryKey: ["saved-npcs", campaignId] });
      qc.invalidateQueries({ queryKey: ["npc-affiliations", campaignId] });
      return data;
    },
  });
}

export function useUpdateSavedNpc(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; patch: Partial<SavedNpcData> }): Promise<SavedNpcData> => {
      const res = await fetch(`/api/saved-npc/${args.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args.patch),
      });
      if (!res.ok) throw new Error("Failed to update NPC");
      return res.json();
    },
    onSuccess: (data) => {
      // Optimistically update all matching query cache entries
      qc.setQueriesData<SavedNpcData[]>({ queryKey: ["saved-npcs", campaignId] }, (prev) =>
        prev ? prev.map((n) => (n.id === data.id ? data : n)) : prev
      );
    },
  });
}

export function useDeleteSavedNpc(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/saved-npc/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete NPC");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-npcs", campaignId] }),
  });
}

export function useCreateAffiliation(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<NpcAffiliationData> => {
      const res = await fetch("/api/npc-affiliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, name }),
      });
      if (!res.ok) throw new Error("Failed to create affiliation");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["npc-affiliations", campaignId] }),
  });
}
