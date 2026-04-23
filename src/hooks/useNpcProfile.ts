import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NpcProfile, NpcProfileConfig } from "@/types/npc";

async function fetchProfiles(campaignId: string): Promise<NpcProfile[]> {
  const res = await fetch(`/api/npc-profile?campaignId=${campaignId}`);
  if (!res.ok) throw new Error("Failed to fetch NPC profiles");
  return res.json();
}

export function useNpcProfiles(campaignId: string) {
  return useQuery({
    queryKey: ["npc-profiles", campaignId],
    queryFn: () => fetchProfiles(campaignId),
    enabled: !!campaignId,
  });
}

export function useCreateNpcProfile(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { name: string; config?: NpcProfileConfig }): Promise<NpcProfile> => {
      const res = await fetch("/api/npc-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, ...args }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(JSON.stringify(body));
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["npc-profiles", campaignId] }),
  });
}

export function useSaveNpcProfile(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, config, name }: { id: string; config?: NpcProfileConfig; name?: string }): Promise<NpcProfile> => {
      const res = await fetch(`/api/npc-profile/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, name }),
      });
      if (!res.ok) throw new Error("Failed to save profile");
      return res.json();
    },
    onSuccess: (data) => {
      qc.setQueryData<NpcProfile[]>(["npc-profiles", campaignId], (prev) =>
        prev ? prev.map((p) => (p.id === data.id ? data : p)) : [data]
      );
    },
  });
}

export function useDeleteNpcProfile(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/npc-profile/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete profile");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["npc-profiles", campaignId] }),
  });
}
