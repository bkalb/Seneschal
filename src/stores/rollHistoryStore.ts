import { create } from "zustand";
import type { TableRollResult } from "@/types/table";

export type RollEntry = TableRollResult;

const MAX_HISTORY = 20;

interface RollHistoryStore {
  entries: RollEntry[];
  addRoll: (entry: RollEntry) => void;
  clearHistory: () => void;
}

export const useRollHistoryStore = create<RollHistoryStore>((set) => ({
  entries: [],
  addRoll: (entry) =>
    set((state) => ({
      entries: [entry, ...state.entries].slice(0, MAX_HISTORY),
    })),
  clearHistory: () => set({ entries: [] }),
}));
