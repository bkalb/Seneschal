import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { RandomTable, TableRollResult, TableCategory } from "@/types/table";
import { useRollHistoryStore } from "@/stores/rollHistoryStore";

async function fetchTables(campaignId: string, category?: TableCategory): Promise<RandomTable[]> {
  const url = new URL("/api/random-tables", window.location.origin);
  url.searchParams.set("campaignId", campaignId);
  if (category) url.searchParams.set("category", category);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to fetch tables");
  return res.json();
}

export function useRandomTables(campaignId: string, category?: TableCategory) {
  return useQuery({
    queryKey: ["random-tables", campaignId, category],
    queryFn: () => fetchTables(campaignId, category),
    enabled: !!campaignId,
  });
}

export function useCreateTable(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<RandomTable, "id" | "sortOrder" | "lastResult"> & { rows: RandomTable["rows"]; modifiers: RandomTable["modifiers"]; regionIds: string[] }) => {
      const res = await fetch("/api/random-tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, campaignId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(JSON.stringify(body) || "Failed to create table");
      }
      return res.json() as Promise<RandomTable>;
    },
    onSuccess: (table) => {
      qc.invalidateQueries({ queryKey: ["random-tables", campaignId, table.category] });
      qc.invalidateQueries({ queryKey: ["random-tables", campaignId] });
    },
  });
}

export function useUpdateTable(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<RandomTable> & { id: string }) => {
      const res = await fetch(`/api/random-tables/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(text || `HTTP ${res.status}`);
      }
      return res.json() as Promise<RandomTable>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["random-tables", campaignId] });
    },
  });
}

export function useDuplicateTable(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/random-tables/${id}/duplicate`, { method: "POST" });
      if (!res.ok) {
        const text = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(text || `HTTP ${res.status}`);
      }
      return res.json() as Promise<RandomTable>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["random-tables", campaignId] });
    },
  });
}

export function useDeleteTable(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/random-tables/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete table");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["random-tables", campaignId] });
    },
  });
}

export function useRollTable() {
  const addRoll = useRollHistoryStore((s) => s.addRoll);
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      tableId,
      campaignId,
      currentRegionId,
      userToggles,
    }: {
      tableId: string;
      campaignId: string;
      currentRegionId: string | null;
      userToggles: string[];
    }): Promise<TableRollResult> => {
      const res = await fetch(`/api/random-tables/${tableId}/roll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentRegionId, userToggles }),
      });
      if (!res.ok) throw new Error("Roll failed");
      return res.json();
    },
    onSuccess: (result, { campaignId }) => {
      addRoll(result);
      // Invalidate to refresh lastResult for stateful tables
      qc.invalidateQueries({ queryKey: ["random-tables", campaignId] });
    },
  });
}

export function useImportTablePreview() {
  return useMutation({
    mutationFn: async ({ raw, format }: { raw: string; format?: string }) => {
      const res = await fetch("/api/random-tables/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw, format }),
      });
      if (!res.ok) throw new Error("Import preview failed");
      return res.json();
    },
  });
}
