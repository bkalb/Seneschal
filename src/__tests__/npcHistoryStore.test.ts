import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useNpcHistoryStore } from "@/stores/npcHistoryStore";
import type { NpcResultSet } from "@/types/npcHistory";

const STORAGE_KEY = "dm-npc-history";

// ─── Fixtures ────────────────────────────────────────────────────────────────

let nextId = 0;

function makeSet(overrides: Partial<NpcResultSet> = {}): NpcResultSet {
  nextId += 1;
  return {
    id: `set-${nextId}`,
    createdAt: nextId,
    profileId: "prof1",
    profileName: "Test Profile",
    inGameDate: null,
    inGameDateLabel: null,
    regionId: null,
    regionName: null,
    pinned: false,
    npcs: [],
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  useNpcHistoryStore.setState({ retention: 10, byCampaign: {} });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── pushSet — prepend + trim ─────────────────────────────────────────────────

describe("pushSet", () => {
  it("prepends new sets newest-first and trims to the retention limit", () => {
    useNpcHistoryStore.setState({ retention: 5 });
    const campaignId = "camp1";

    for (let i = 0; i < 8; i++) {
      useNpcHistoryStore.getState().pushSet(campaignId, makeSet({ id: `s${i}`, createdAt: i }));
    }

    const sets = useNpcHistoryStore.getState().byCampaign[campaignId];
    expect(sets.map((s) => s.id)).toEqual(["s7", "s6", "s5", "s4", "s3"]);
  });
});

// ─── setRetention — trims immediately ─────────────────────────────────────────

describe("setRetention", () => {
  it("lowering retention from 25 to 5 trims existing history immediately", () => {
    useNpcHistoryStore.setState({ retention: 25 });
    const campaignId = "camp1";

    for (let i = 0; i < 8; i++) {
      useNpcHistoryStore.getState().pushSet(campaignId, makeSet({ id: `s${i}`, createdAt: i }));
    }
    expect(useNpcHistoryStore.getState().byCampaign[campaignId].length).toBe(8);

    useNpcHistoryStore.getState().setRetention(5);

    const sets = useNpcHistoryStore.getState().byCampaign[campaignId];
    expect(useNpcHistoryStore.getState().retention).toBe(5);
    expect(sets.map((s) => s.id)).toEqual(["s7", "s6", "s5", "s4", "s3"]);
  });

  it("trims every campaign, not just the one being viewed", () => {
    useNpcHistoryStore.setState({ retention: 25 });
    for (let i = 0; i < 8; i++) {
      useNpcHistoryStore.getState().pushSet("camp1", makeSet({ id: `a${i}`, createdAt: i }));
      useNpcHistoryStore.getState().pushSet("camp2", makeSet({ id: `b${i}`, createdAt: i }));
    }

    useNpcHistoryStore.getState().setRetention(5);

    const state = useNpcHistoryStore.getState();
    expect(state.byCampaign.camp1.length).toBe(5);
    expect(state.byCampaign.camp2.length).toBe(5);
  });
});

// ─── Pinning — exempt from retention ──────────────────────────────────────────

describe("togglePin", () => {
  it("pinned sets survive trimming and do not count toward the retention limit", () => {
    useNpcHistoryStore.setState({ retention: 5 });
    const campaignId = "camp1";

    useNpcHistoryStore.getState().pushSet(campaignId, makeSet({ id: "pinned-1", createdAt: 1, pinned: true }));
    useNpcHistoryStore.getState().pushSet(campaignId, makeSet({ id: "pinned-2", createdAt: 2, pinned: true }));
    for (let i = 0; i < 8; i++) {
      useNpcHistoryStore.getState().pushSet(campaignId, makeSet({ id: `u${i}`, createdAt: 10 + i }));
    }

    const sets = useNpcHistoryStore.getState().byCampaign[campaignId];
    const pinnedIds = sets.filter((s) => s.pinned).map((s) => s.id).sort();
    const unpinned = sets.filter((s) => !s.pinned);

    expect(pinnedIds).toEqual(["pinned-1", "pinned-2"]);
    expect(unpinned.length).toBe(5); // retention, unaffected by the 2 pinned sets
    expect(unpinned.map((s) => s.id)).toEqual(["u7", "u6", "u5", "u4", "u3"]);
    expect(sets.length).toBe(7);
  });

  it("keeps a pinned set alive even after later pushes would otherwise trim it away", () => {
    useNpcHistoryStore.setState({ retention: 5 });
    const campaignId = "camp1";

    useNpcHistoryStore.getState().pushSet(campaignId, makeSet({ id: "s0", createdAt: 0 }));
    useNpcHistoryStore.getState().togglePin(campaignId, "s0");

    for (let i = 1; i <= 6; i++) {
      useNpcHistoryStore.getState().pushSet(campaignId, makeSet({ id: `s${i}`, createdAt: i }));
    }

    const sets = useNpcHistoryStore.getState().byCampaign[campaignId];
    expect(sets.find((s) => s.id === "s0")).toBeTruthy();
    expect(sets.filter((s) => !s.pinned).length).toBe(5);
  });

  it("re-applies trimming as soon as a set is unpinned", () => {
    useNpcHistoryStore.setState({ retention: 5 });
    const campaignId = "camp1";

    useNpcHistoryStore.getState().pushSet(campaignId, makeSet({ id: "old", createdAt: 0, pinned: true }));
    for (let i = 1; i <= 5; i++) {
      useNpcHistoryStore.getState().pushSet(campaignId, makeSet({ id: `n${i}`, createdAt: i }));
    }

    // "old" is currently pinned, so it's exempt and all 6 sets are present.
    expect(useNpcHistoryStore.getState().byCampaign[campaignId].length).toBe(6);

    // Unpinning it should immediately subject it to the retention=5 cap, and
    // being the oldest, it's the one trimmed away.
    useNpcHistoryStore.getState().togglePin(campaignId, "old");

    const sets = useNpcHistoryStore.getState().byCampaign[campaignId];
    expect(sets.map((s) => s.id)).toEqual(["n5", "n4", "n3", "n2", "n1"]);
  });
});

// ─── clear ─────────────────────────────────────────────────────────────────

describe("clear", () => {
  it("removes only the given campaign's history, leaving other campaigns intact", () => {
    useNpcHistoryStore.getState().pushSet("camp1", makeSet({ id: "a" }));
    useNpcHistoryStore.getState().pushSet("camp2", makeSet({ id: "b" }));

    useNpcHistoryStore.getState().clear("camp1");

    const state = useNpcHistoryStore.getState();
    expect(state.byCampaign.camp1).toBeUndefined();
    expect(state.byCampaign.camp2?.map((s) => s.id)).toEqual(["b"]);
  });
});

// ─── Quota self-heal — eviction order (§8.2) ──────────────────────────────────

describe("quota self-heal", () => {
  it("evicts the oldest unpinned set across all campaigns first, falling back to pinned sets only once every unpinned set is gone", async () => {
    const pinnedA1 = makeSet({ id: "pinned-a1", createdAt: 100, pinned: true });
    const unpinnedA1 = makeSet({ id: "unpinned-a1", createdAt: 50, pinned: false });
    const unpinnedA2 = makeSet({ id: "unpinned-a2", createdAt: 200, pinned: false });
    const pinnedB1 = makeSet({ id: "pinned-b1", createdAt: 10, pinned: true });
    const unpinnedB1 = makeSet({ id: "unpinned-b1", createdAt: 300, pinned: false });

    useNpcHistoryStore.setState({
      retention: 25,
      byCampaign: {
        "camp-A": [pinnedA1, unpinnedA1, unpinnedA2],
        "camp-B": [pinnedB1, unpinnedB1],
      },
    });

    // Sanity check: the unmocked baseline write landed with all 5 sets.
    const before = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(before.state.byCampaign["camp-A"].length).toBe(3);
    expect(before.state.byCampaign["camp-B"].length).toBe(2);

    // Simulate localStorage rejecting the write with QuotaExceededError for
    // the first 4 attempts (there are 3 unpinned sets total, plus 1 pinned
    // set that must go before the write can succeed), then let it through.
    const originalSetItem = Storage.prototype.setItem;
    let throwsLeft = 4;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      if (key === STORAGE_KEY && throwsLeft > 0) {
        throwsLeft--;
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    });

    // Trigger a persist write without changing the logical data.
    useNpcHistoryStore.getState().dismissSet("camp-A", "no-such-id");

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    const byCampaign = persisted.state.byCampaign as Record<string, { id: string }[]>;
    const remainingIds = [
      ...(byCampaign["camp-A"] ?? []).map((s) => s.id),
      ...(byCampaign["camp-B"] ?? []).map((s) => s.id),
    ];

    // Eviction order: unpinned-a1 (50) -> unpinned-a2 (200) -> unpinned-b1
    // (300) -- oldest-unpinned-first, irrespective of campaign -- then,
    // with no unpinned sets left anywhere, pinned-b1 (10) as the last
    // resort. pinned-a1 (100) is the sole survivor.
    expect(remainingIds).toEqual(["pinned-a1"]);

    // Recommended reconciliation per §8.2: bring the in-memory store back in
    // sync with what actually landed on disk.
    await useNpcHistoryStore.persist.rehydrate();
    const state = useNpcHistoryStore.getState();
    expect(state.byCampaign["camp-A"]?.map((s) => s.id)).toEqual(["pinned-a1"]);
    expect(state.byCampaign["camp-B"] ?? []).toEqual([]);
  });
});
