import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TableRollResult } from "@/types/table";

export type RollEntry = TableRollResult;

const MAX_HISTORY = 100;

interface RollHistoryStore {
  entries: RollEntry[];
  addRoll: (entry: RollEntry) => void;
  clearHistory: () => void;
}

export const useRollHistoryStore = create<RollHistoryStore>()(
  persist(
    (set) => ({
      entries: [],
      addRoll: (entry) =>
        set((state) => ({
          entries: [entry, ...state.entries].slice(0, MAX_HISTORY),
        })),
      clearHistory: () => set({ entries: [] }),
    }),
    { name: "dm-roll-history" }
  )
);
