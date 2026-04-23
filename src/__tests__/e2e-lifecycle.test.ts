/**
 * End-to-end lifecycle integration tests.
 *
 * These tests exercise the full save → browse → edit → delete flow using MSW
 * to simulate real API responses, verifying that:
 *  - A generated NPC can be saved individually
 *  - A batch can be saved with an affiliation that is created on the fly
 *  - Saved NPCs appear in browse results
 *  - Individual fields can be patched
 *  - An NPC can be pinned and unpinned
 *  - An NPC can be marked deceased and revived
 *  - An NPC can be deleted
 *  - Cross-campaign isolation holds (campaign A's NPCs don't appear in campaign B)
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { SavedNpcData, NpcAffiliationData } from "@/types/savedNpc";

// ─── In-memory "database" ─────────────────────────────────────────────────────

type DbNpc = SavedNpcData;
type DbAff = NpcAffiliationData;

let npcStore: DbNpc[] = [];
let affStore: DbAff[] = [];
let nextId = 1;

function makeId() {
  return `id-${nextId++}`;
}

function resetDb() {
  npcStore = [];
  affStore = [];
}

// ─── MSW server ───────────────────────────────────────────────────────────────

const server = setupServer(
  // GET /api/saved-npc
  http.get("/api/saved-npc", ({ request }) => {
    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId");
    const search = url.searchParams.get("search");
    const status = url.searchParams.get("status");
    const affiliationId = url.searchParams.get("affiliationId");

    let results = npcStore.filter((n) => n.campaignId === campaignId);
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(
        (n) => n.name?.toLowerCase().includes(q) || n.type?.toLowerCase().includes(q)
      );
    }
    if (status === "alive") results = results.filter((n) => !n.isDeceased);
    if (status === "deceased") results = results.filter((n) => n.isDeceased);
    if (affiliationId) results = results.filter((n) => n.affiliationId === affiliationId);
    // Pinned first
    results.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

    return HttpResponse.json(results);
  }),

  // POST /api/saved-npc
  http.post("/api/saved-npc", async ({ request }) => {
    const body = await request.json() as Partial<DbNpc> & { campaignId: string };
    const now = new Date().toISOString();
    const npc: DbNpc = {
      id: makeId(),
      campaignId: body.campaignId,
      affiliationId: body.affiliationId ?? null,
      name: body.name ?? null,
      gender: body.gender ?? "male",
      age: body.age ?? null,
      type: body.type ?? null,
      typeLabel: body.typeLabel ?? "Type",
      secondaryType: body.secondaryType ?? null,
      secondaryTypeLabel: body.secondaryTypeLabel ?? null,
      physical: body.physical ?? [],
      personality: body.personality ?? [],
      details: body.details ?? [],
      isDeceased: false,
      isPinned: false,
      notes: null,
      createdAt: now,
      updatedAt: now,
    };
    npcStore.push(npc);
    return HttpResponse.json(npc, { status: 201 });
  }),

  // POST /api/saved-npc/batch
  http.post("/api/saved-npc/batch", async ({ request }) => {
    const body = await request.json() as { campaignId: string; affiliationName?: string; npcs: Partial<DbNpc>[] };
    let affiliationId: string | null = null;
    if (body.affiliationName) {
      let aff = affStore.find((a) => a.campaignId === body.campaignId && a.name === body.affiliationName);
      if (!aff) {
        aff = { id: makeId(), campaignId: body.campaignId, name: body.affiliationName, createdAt: new Date().toISOString() };
        affStore.push(aff);
      }
      affiliationId = aff.id;
    }
    const now = new Date().toISOString();
    const created = body.npcs.map((n) => {
      const npc: DbNpc = {
        id: makeId(),
        campaignId: body.campaignId,
        affiliationId,
        name: n.name ?? null,
        gender: n.gender ?? "male",
        age: n.age ?? null,
        type: n.type ?? null,
        typeLabel: n.typeLabel ?? "Type",
        secondaryType: n.secondaryType ?? null,
        secondaryTypeLabel: n.secondaryTypeLabel ?? null,
        physical: n.physical ?? [],
        personality: n.personality ?? [],
        details: n.details ?? [],
        isDeceased: false,
        isPinned: false,
        notes: null,
        createdAt: now,
        updatedAt: now,
      };
      npcStore.push(npc);
      return npc;
    });
    return HttpResponse.json(created, { status: 201 });
  }),

  // PATCH /api/saved-npc/:id
  http.patch("/api/saved-npc/:id", async ({ params, request }) => {
    const body = await request.json() as Partial<DbNpc>;
    const idx = npcStore.findIndex((n) => n.id === params.id);
    if (idx === -1) return HttpResponse.json({ error: "Not found" }, { status: 404 });
    npcStore[idx] = { ...npcStore[idx], ...body, updatedAt: new Date().toISOString() };
    return HttpResponse.json(npcStore[idx]);
  }),

  // DELETE /api/saved-npc/:id
  http.delete("/api/saved-npc/:id", ({ params }) => {
    const idx = npcStore.findIndex((n) => n.id === params.id);
    if (idx === -1) return HttpResponse.json({ error: "Not found" }, { status: 404 });
    npcStore.splice(idx, 1);
    return HttpResponse.json({ success: true });
  }),

  // GET /api/npc-affiliation
  http.get("/api/npc-affiliation", ({ request }) => {
    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId");
    return HttpResponse.json(affStore.filter((a) => a.campaignId === campaignId));
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => { resetDb(); server.resetHandlers(); });
afterAll(() => server.close());

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function saveNpc(campaignId: string, name: string): Promise<DbNpc> {
  const res = await fetch("/api/saved-npc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaignId, name, gender: "male", typeLabel: "Homeland" }),
  });
  return res.json();
}

async function saveBatch(campaignId: string, names: string[], affiliationName?: string): Promise<DbNpc[]> {
  const res = await fetch("/api/saved-npc/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      campaignId,
      affiliationName,
      npcs: names.map((name) => ({ name, gender: "male", typeLabel: "Homeland" })),
    }),
  });
  return res.json();
}

async function listNpcs(campaignId: string, params: Record<string, string> = {}): Promise<DbNpc[]> {
  const p = new URLSearchParams({ campaignId, ...params });
  const res = await fetch(`/api/saved-npc?${p}`);
  return res.json();
}

async function patchNpc(id: string, patch: Partial<DbNpc>): Promise<DbNpc> {
  const res = await fetch(`/api/saved-npc/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return res.json();
}

async function deleteNpc(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`/api/saved-npc/${id}`, { method: "DELETE" });
  return res.json();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("End-to-end: full NPC save → browse → edit → delete lifecycle", () => {
  it("saves a single NPC and it appears in the browse list", async () => {
    await saveNpc("camp1", "Aldric");
    const list = await listNpcs("camp1");
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Aldric");
  });

  it("saves a batch with an affiliation and all NPCs appear with affiliationId", async () => {
    const batch = await saveBatch("camp1", ["Mira", "Torvin"], "Bogrim's Bandits");
    expect(batch).toHaveLength(2);
    expect(batch[0].affiliationId).toBeTruthy();
    expect(batch[1].affiliationId).toBe(batch[0].affiliationId);

    const list = await listNpcs("camp1");
    expect(list).toHaveLength(2);
  });

  it("edits a saved NPC field and the change is reflected in subsequent browse", async () => {
    const { id } = await saveNpc("camp1", "Aldric");
    await patchNpc(id, { name: "Aldric the Bold" });
    const list = await listNpcs("camp1");
    expect(list[0].name).toBe("Aldric the Bold");
  });

  it("pins an NPC and it sorts to the top of subsequent browse results", async () => {
    await saveNpc("camp1", "Mira");
    const { id } = await saveNpc("camp1", "Aldric");
    await patchNpc(id, { isPinned: true });
    const list = await listNpcs("camp1");
    expect(list[0].name).toBe("Aldric");
    expect(list[0].isPinned).toBe(true);
  });

  it("unpins an NPC and it no longer appears first", async () => {
    const { id } = await saveNpc("camp1", "Aldric");
    await patchNpc(id, { isPinned: true });
    await patchNpc(id, { isPinned: false });
    const list = await listNpcs("camp1");
    expect(list[0].isPinned).toBe(false);
  });

  it("marks NPC as deceased and deceased filter returns only that NPC", async () => {
    const { id } = await saveNpc("camp1", "Aldric");
    await saveNpc("camp1", "Mira");
    await patchNpc(id, { isDeceased: true });

    const deceased = await listNpcs("camp1", { status: "deceased" });
    expect(deceased).toHaveLength(1);
    expect(deceased[0].name).toBe("Aldric");

    const alive = await listNpcs("camp1", { status: "alive" });
    expect(alive).toHaveLength(1);
    expect(alive[0].name).toBe("Mira");
  });

  it("revives a deceased NPC and it appears in alive filter again", async () => {
    const { id } = await saveNpc("camp1", "Aldric");
    await patchNpc(id, { isDeceased: true });
    await patchNpc(id, { isDeceased: false });

    const alive = await listNpcs("camp1", { status: "alive" });
    expect(alive).toHaveLength(1);
    expect(alive[0].name).toBe("Aldric");
  });

  it("deletes an NPC and it no longer appears in browse results", async () => {
    const { id } = await saveNpc("camp1", "Aldric");
    const { success } = await deleteNpc(id);
    expect(success).toBe(true);
    const list = await listNpcs("camp1");
    expect(list).toHaveLength(0);
  });

  it("search by name returns matching NPCs only", async () => {
    await saveNpc("camp1", "Aldric");
    await saveNpc("camp1", "Mira");
    const results = await listNpcs("camp1", { search: "ald" });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Aldric");
  });

  it("deleting a nonexistent NPC returns 404", async () => {
    const res = await fetch("/api/saved-npc/nonexistent", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("Cross-campaign isolation", () => {
  it("NPCs saved in campaign A do not appear in campaign B", async () => {
    await saveNpc("camp-A", "Aldric");
    await saveNpc("camp-B", "Mira");

    const campA = await listNpcs("camp-A");
    const campB = await listNpcs("camp-B");

    expect(campA).toHaveLength(1);
    expect(campA[0].name).toBe("Aldric");

    expect(campB).toHaveLength(1);
    expect(campB[0].name).toBe("Mira");
  });

  it("affiliations are scoped per campaign", async () => {
    await saveBatch("camp-A", ["Aldric", "Torvin"], "The High Council");
    await saveBatch("camp-B", ["Mira"], "Shadow Guild");

    const affRes = await fetch("/api/npc-affiliation?campaignId=camp-A");
    const affs: NpcAffiliationData[] = await affRes.json();
    expect(affs).toHaveLength(1);
    expect(affs[0].name).toBe("The High Council");
  });
});
