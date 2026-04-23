import { create } from "zustand";

interface UIStore {
  // Set of expanded section IDs (ephemeral — not persisted)
  // Sections not in this set are collapsed by default
  expandedSections: Set<string>;
  toggleSection: (id: string) => void;
  isSectionCollapsed: (id: string) => boolean;
}

export const useUIStore = create<UIStore>((set, get) => ({
  expandedSections: new Set(),
  toggleSection: (id) =>
    set((state) => {
      const next = new Set(state.expandedSections);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { expandedSections: next };
    }),
  isSectionCollapsed: (id) => !get().expandedSections.has(id),
}));
