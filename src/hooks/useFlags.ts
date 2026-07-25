import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface CampaignFlag {
  id: string;
  campaignId: string;
  label: string;
  color: string;
  counter: number | null;
  countDirection: "up" | "down" | null;
  paused: boolean;
  sortOrder: number;
}

/** Payload for creating/editing a flag (see `createSchema` in `src/app/api/flags/route.ts`). */
export type FlagInput = Omit<CampaignFlag, "id" | "campaignId" | "sortOrder">;

export function useFlags(campaignId: string) {
  return useQuery<CampaignFlag[]>({
    queryKey: ["flags", campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/flags?campaignId=${campaignId}`);
      if (!res.ok) throw new Error("Failed to fetch flags");
      return res.json();
    },
    enabled: !!campaignId,
  });
}

export function useCreateFlag(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: FlagInput) => {
      const res = await fetch("/api/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, ...data }),
      });
      if (!res.ok) throw new Error("Failed to create flag");
      return res.json() as Promise<CampaignFlag>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["flags", campaignId] }),
  });
}

export function useUpdateFlag(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: Partial<Omit<CampaignFlag, "campaignId" | "createdAt" | "updatedAt">> & { id: string }) => {
      const res = await fetch(`/api/flags/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update flag");
      return res.json() as Promise<CampaignFlag>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["flags", campaignId] }),
  });
}

export function useDeleteFlag(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/flags/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete flag");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["flags", campaignId] }),
  });
}
