import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { SavedNpcData, NpcAffiliationData } from "@/types/savedNpc";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CAMPAIGN_ID = "camp1";

const mockNpc: SavedNpcData = {
  id: "npc1",
  campaignId: CAMPAIGN_ID,
  affiliationId: null,
  name: "Aldric",
  gender: "male",
  age: "34",
  type: "Ruislip",
  typeLabel: "Homeland",
  secondaryType: "Fighter",
  secondaryTypeLabel: "Class",
  physical: ["Tall", "Blonde"],
  personality: ["Brave"],
  details: [{ label: "Weapon", value: "Longsword" }],
  isDeceased: false,
  isPinned: false,
  notes: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockAff: NpcAffiliationData = {
  id: "aff1",
  campaignId: CAMPAIGN_ID,
  name: "Bogrim's Bandits",
  createdAt: new Date().toISOString(),
};

// ─── MSW server ───────────────────────────────────────────────────────────────

const server = setupServer(
  // GET /api/saved-npc
  http.get("/api/saved-npc", ({ request }) => {
    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId");
    if (!campaignId) return HttpResponse.json({ error: "campaignId required" }, { status: 400 });
    return HttpResponse.json([mockNpc]);
  }),

  // POST /api/saved-npc
  http.post("/api/saved-npc", async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    if (!body.campaignId) return HttpResponse.json({ error: "campaignId required" }, { status: 400 });
    return HttpResponse.json({ ...mockNpc, ...body }, { status: 201 });
  }),

  // POST /api/saved-npc/batch
  http.post("/api/saved-npc/batch", async ({ request }) => {
    const body = await request.json() as { campaignId?: string; npcs?: unknown[] };
    if (!body.campaignId) return HttpResponse.json({ error: "campaignId required" }, { status: 400 });
    if (!body.npcs?.length) return HttpResponse.json({ error: "npcs required" }, { status: 400 });
    return HttpResponse.json([mockNpc], { status: 201 });
  }),

  // PATCH /api/saved-npc/:id
  http.patch("/api/saved-npc/:id", async ({ params, request }) => {
    if (params.id === "nonexistent") return HttpResponse.json({ error: "Not found" }, { status: 404 });
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ...mockNpc, ...body, id: params.id });
  }),

  // DELETE /api/saved-npc/:id
  http.delete("/api/saved-npc/:id", ({ params }) => {
    if (params.id === "nonexistent") return HttpResponse.json({ error: "Not found" }, { status: 404 });
    return HttpResponse.json({ success: true });
  }),

  // GET /api/npc-affiliation
  http.get("/api/npc-affiliation", ({ request }) => {
    const url = new URL(request.url);
    if (!url.searchParams.get("campaignId")) {
      return HttpResponse.json({ error: "campaignId required" }, { status: 400 });
    }
    return HttpResponse.json([mockAff]);
  }),

  // POST /api/npc-affiliation
  http.post("/api/npc-affiliation", async ({ request }) => {
    const body = await request.json() as { campaignId?: string; name?: string };
    if (!body.campaignId || !body.name) {
      return HttpResponse.json({ error: "invalid" }, { status: 400 });
    }
    return HttpResponse.json({ ...mockAff, name: body.name }, { status: 201 });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/saved-npc", () => {
  it("returns saved NPCs for a campaign", async () => {
    const res = await fetch(`/api/saved-npc?campaignId=${CAMPAIGN_ID}`);
    expect(res.status).toBe(200);
    const data: SavedNpcData[] = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe("Aldric");
    expect(data[0].physical).toEqual(["Tall", "Blonde"]);
  });

  it("returns 400 when campaignId is missing", async () => {
    const res = await fetch("/api/saved-npc");
    expect(res.status).toBe(400);
  });
});

describe("POST /api/saved-npc", () => {
  it("creates a single saved NPC", async () => {
    const payload = {
      campaignId: CAMPAIGN_ID,
      name: "Mira",
      gender: "female",
      typeLabel: "Homeland",
    };
    const res = await fetch("/api/saved-npc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(201);
    const data: SavedNpcData = await res.json();
    expect(data.name).toBe("Mira");
  });
});

describe("POST /api/saved-npc/batch", () => {
  it("saves a batch of NPCs", async () => {
    const payload = {
      campaignId: CAMPAIGN_ID,
      affiliationName: "Bogrim's Bandits",
      npcs: [
        { name: "Aldric", gender: "male", typeLabel: "Homeland" },
        { name: "Mira", gender: "female", typeLabel: "Homeland" },
      ],
    };
    const res = await fetch("/api/saved-npc/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(201);
    const data: SavedNpcData[] = await res.json();
    expect(data.length).toBeGreaterThan(0);
  });

  it("returns 400 when npcs is empty", async () => {
    const res = await fetch("/api/saved-npc/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID, npcs: [] }),
    });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/saved-npc/:id", () => {
  it("updates a saved NPC field", async () => {
    const res = await fetch("/api/saved-npc/npc1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDeceased: true }),
    });
    expect(res.status).toBe(200);
    const data: SavedNpcData = await res.json();
    expect(data.isDeceased).toBe(true);
  });

  it("returns 404 for a nonexistent NPC", async () => {
    const res = await fetch("/api/saved-npc/nonexistent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDeceased: true }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/saved-npc/:id", () => {
  it("deletes a saved NPC", async () => {
    const res = await fetch("/api/saved-npc/npc1", { method: "DELETE" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("returns 404 for a nonexistent NPC", async () => {
    const res = await fetch("/api/saved-npc/nonexistent", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/npc-affiliation", () => {
  it("returns affiliations for a campaign", async () => {
    const res = await fetch(`/api/npc-affiliation?campaignId=${CAMPAIGN_ID}`);
    expect(res.status).toBe(200);
    const data: NpcAffiliationData[] = await res.json();
    expect(data[0].name).toBe("Bogrim's Bandits");
  });

  it("returns 400 when campaignId is missing", async () => {
    const res = await fetch("/api/npc-affiliation");
    expect(res.status).toBe(400);
  });
});

describe("POST /api/npc-affiliation", () => {
  it("creates a new affiliation", async () => {
    const res = await fetch("/api/npc-affiliation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID, name: "The High Council" }),
    });
    expect(res.status).toBe(201);
    const data: NpcAffiliationData = await res.json();
    expect(data.name).toBe("The High Council");
  });
});
