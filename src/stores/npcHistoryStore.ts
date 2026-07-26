import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { toast } from "sonner";
import type { GeneratedNpc } from "@/types/npc";
import type { NpcResultSet, NpcHistoryRetention } from "@/types/npcHistory";

const STORAGE_KEY = "dm-npc-history";
const STORAGE_VERSION = 1;

/**
 * Stable identity for "this campaign has no sets yet". Selectors run on every
 * store read (and on every render under `useSyncExternalStore`), so falling
 * back to a fresh `[]` would hand React a new snapshot each time.
 */
const EMPTY_SETS: readonly NpcResultSet[] = Object.freeze([]);

/** Newest-first sets for a campaign, or a shared empty array. */
export const selectSets =
  (campaignId: string) =>
  (state: NpcHistoryStore): readonly NpcResultSet[] =>
    state.byCampaign[campaignId] ?? EMPTY_SETS;

// ─── Trimming (§8.1) ───────────────────────────────────────────────────────

/** Pinned sets are exempt from the retention count (D14). */
function trim(sets: NpcResultSet[], retention: number): NpcResultSet[] {
  const pinned = sets.filter((s) => s.pinned);
  const unpinned = sets.filter((s) => !s.pinned).slice(0, retention);
  return [...pinned, ...unpinned].sort((a, b) => b.createdAt - a.createdAt);
}

// ─── Quota self-heal (§8.2) ────────────────────────────────────────────────

function isQuotaError(e: unknown): boolean {
  // Duck-typed rather than `instanceof DOMException`: the exception can cross a
  // realm boundary, and not every engine throws a DOMException here.
  if (typeof e !== "object" || e === null) return false;
  const { name, code } = e as { name?: unknown; code?: unknown };
  return (
    name === "QuotaExceededError" ||
    // Safari legacy
    code === 22 ||
    name === "NS_ERROR_DOM_QUOTA_REACHED"
  );
}

interface PersistedPayload {
  state: {
    retention?: NpcHistoryRetention;
    byCampaign: Record<string, NpcResultSet[]>;
  };
  version?: number;
}

/**
 * Drops the single oldest unpinned set across ALL campaigns. Only when no
 * unpinned sets remain anywhere does it fall back to dropping the oldest
 * pinned set (D14 makes pinned sets otherwise unbounded, so this last resort
 * is required). Returns the re-serialized payload, or `null` when there is
 * nothing left to evict.
 */
function evictOldest(payload: string): string | null {
  let parsed: PersistedPayload;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  const byCampaign = parsed.state?.byCampaign;
  if (!byCampaign) return null;

  const all: { campaignId: string; set: NpcResultSet }[] = [];
  for (const [campaignId, sets] of Object.entries(byCampaign)) {
    for (const set of sets) all.push({ campaignId, set });
  }
  if (all.length === 0) return null;

  const unpinned = all.filter((entry) => !entry.set.pinned);
  const pool = unpinned.length > 0 ? unpinned : all;

  const oldest = pool.reduce((a, b) => (b.set.createdAt < a.set.createdAt ? b : a));

  const nextByCampaign: Record<string, NpcResultSet[]> = {
    ...byCampaign,
    [oldest.campaignId]: byCampaign[oldest.campaignId].filter((s) => s.id !== oldest.set.id),
  };

  return JSON.stringify({
    ...parsed,
    state: { ...parsed.state, byCampaign: nextByCampaign },
  });
}

const quotaSafeStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  removeItem: (name) => localStorage.removeItem(name),
  setItem(name, value) {
    let payload = value;
    let evicted = false;
    for (let attempt = 0; attempt < 64; attempt++) {
      try {
        localStorage.setItem(name, payload);
        if (evicted) {
          // Known limitation (§8.2): the in-memory store still holds sets
          // that just got evicted from disk. Reconcile immediately rather
          // than waiting for next page load. Deferred to a microtask so we
          // don't re-enter this same persist write while it's on the stack.
          queueMicrotask(() => {
            void useNpcHistoryStore.persist.rehydrate();
          });
        }
        return;
      } catch (e) {
        if (!isQuotaError(e)) throw e;
        const reduced = evictOldest(payload);
        if (reduced === null) {
          toast.error("NPC history storage is full");
          return;
        }
        payload = reduced;
        evicted = true;
      }
    }
  },
};

// ─── Store ─────────────────────────────────────────────────────────────────

interface NpcHistoryStore {
  /** Global preference, not per-campaign. */
  retention: NpcHistoryRetention;
  /** Newest-first per campaign. */
  byCampaign: Record<string, NpcResultSet[]>;

  setRetention: (n: NpcHistoryRetention) => void;
  pushSet: (campaignId: string, set: NpcResultSet) => void;
  updateNpc: (campaignId: string, setId: string, index: number, next: GeneratedNpc) => void;
  markSaved: (campaignId: string, setId: string, index: number, savedNpcId: string | null) => void;
  togglePin: (campaignId: string, setId: string) => void;
  dismissSet: (campaignId: string, setId: string) => void;
  clear: (campaignId: string) => void;
}

export const useNpcHistoryStore = create<NpcHistoryStore>()(
  persist(
    (set) => ({
      retention: 10,
      byCampaign: {},

      setRetention: (n) =>
        set((state) => {
          const byCampaign: Record<string, NpcResultSet[]> = {};
          for (const [campaignId, sets] of Object.entries(state.byCampaign)) {
            byCampaign[campaignId] = trim(sets, n);
          }
          return { retention: n, byCampaign };
        }),

      pushSet: (campaignId, resultSet) =>
        set((state) => {
          const existing = state.byCampaign[campaignId] ?? [];
          const next = trim([resultSet, ...existing], state.retention);
          return { byCampaign: { ...state.byCampaign, [campaignId]: next } };
        }),

      updateNpc: (campaignId, setId, index, next) =>
        set((state) => {
          const sets = state.byCampaign[campaignId];
          if (!sets) return state;
          const updatedSets = sets.map((s) => {
            if (s.id !== setId) return s;
            if (index < 0 || index >= s.npcs.length) return s;
            const npcs = s.npcs.slice();
            npcs[index] = next;
            return { ...s, npcs };
          });
          return { byCampaign: { ...state.byCampaign, [campaignId]: updatedSets } };
        }),

      markSaved: (campaignId, setId, index, savedNpcId) =>
        set((state) => {
          const sets = state.byCampaign[campaignId];
          if (!sets) return state;
          const updatedSets = sets.map((s) => {
            if (s.id !== setId) return s;
            const npc = s.npcs[index];
            if (!npc) return s;
            const npcs = s.npcs.slice();
            npcs[index] = { ...npc, savedNpcId };
            return { ...s, npcs };
          });
          return { byCampaign: { ...state.byCampaign, [campaignId]: updatedSets } };
        }),

      togglePin: (campaignId, setId) =>
        set((state) => {
          const sets = state.byCampaign[campaignId];
          if (!sets) return state;
          const toggled = sets.map((s) => (s.id === setId ? { ...s, pinned: !s.pinned } : s));
          const target = toggled.find((s) => s.id === setId);
          const justUnpinned = target !== undefined && !target.pinned;
          const nextSets = justUnpinned ? trim(toggled, state.retention) : toggled;
          return { byCampaign: { ...state.byCampaign, [campaignId]: nextSets } };
        }),

      dismissSet: (campaignId, setId) =>
        set((state) => {
          const sets = state.byCampaign[campaignId];
          if (!sets) return state;
          return {
            byCampaign: {
              ...state.byCampaign,
              [campaignId]: sets.filter((s) => s.id !== setId),
            },
          };
        }),

      clear: (campaignId) =>
        set((state) => {
          const byCampaign = { ...state.byCampaign };
          delete byCampaign[campaignId];
          return { byCampaign };
        }),
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => quotaSafeStorage),
    }
  )
);
