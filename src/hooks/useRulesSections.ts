import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface RulesSection {
  id: string;
  campaignId: string;
  title: string;
  content: string;
  sortOrder: number;
  // "OVERLAND" | "DUNGEON" | "BOTH"
  applicableModes: string;
}

export function useRulesSections(campaignId: string) {
  return useQuery<RulesSection[]>({
    queryKey: ["rules-sections", campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/rules-sections?campaignId=${campaignId}`);
      if (!res.ok) throw new Error("Failed to fetch rules sections");
      return res.json();
    },
  });
}

export function useCreateSection(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (title: string) => {
      const res = await fetch("/api/rules-sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, title, content: "" }),
      });
      if (!res.ok) throw new Error("Failed to create section");
      return res.json() as Promise<RulesSection>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rules-sections", campaignId] }),
  });
}

export function useUpdateSection(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<RulesSection> & { id: string }) => {
      const res = await fetch(`/api/rules-sections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update section");
      return res.json() as Promise<RulesSection>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rules-sections", campaignId] }),
  });
}

export function useDeleteSection(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/rules-sections/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete section");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rules-sections", campaignId] }),
  });
}

export function useReorderSections(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const res = await fetch(`/api/rules-sections/${campaignId}/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, orderedIds }),
      });
      if (!res.ok) throw new Error("Failed to reorder sections");
    },
    onMutate: async (orderedIds) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ["rules-sections", campaignId] });
      const previous = queryClient.getQueryData<RulesSection[]>(["rules-sections", campaignId]);
      if (previous) {
        const reordered = orderedIds.map((id, index) => {
          const s = previous.find((s) => s.id === id)!;
          return { ...s, sortOrder: index };
        });
        queryClient.setQueryData(["rules-sections", campaignId], reordered);
      }
      return { previous };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["rules-sections", campaignId], context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["rules-sections", campaignId] }),
  });
}
