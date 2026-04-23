import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import React from "react";
import {
  useSavedNpcs,
  useNpcAffiliations,
  useSaveSingleNpc,
  useSaveBatchNpcs,
  useUpdateSavedNpc,
  useDeleteSavedNpc,
} from "@/hooks/useSavedNpcs";
import type { SavedNpcData, NpcAffiliationData } from "@/types/savedNpc";
import type { GeneratedNpc } from "@/types/npc";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CAMPAIGN = "camp1";

const mockNpc: SavedNpcData = {
  id: "npc1",
  campaignId: CAMPAIGN,
  affiliationId: null,
  name: "Aldric",
  gender: "male",
  age: "34",
  type: "Ruislip",
  typeLabel: "Homeland",
  secondaryType: null,
  secondaryTypeLabel: null,
  physical: ["Tall"],
  personality: ["Brave"],
  details: [],
  isDeceased: false,
  isPinned: false,
  notes: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockAff: NpcAffiliationData = {
  id: "aff1",
  campaignId: CAMPAIGN,
  name: "Bogrim's Bandits",
  createdAt: new Date().toISOString(),
};

const generatedNpc: GeneratedNpc = {
  name: "Mira",
  gender: "female",
  age: "28",
  type: "Ruislip",
  typeLabel: "Homeland",
  secondaryType: null,
  secondaryTypeLabel: null,
  physical: [],
  personality: [],
  details: [],
};

// ─── MSW server ───────────────────────────────────────────────────────────────

const server = setupServer(
  http.get("/api/saved-npc", () => HttpResponse.json([mockNpc])),
  http.get("/api/npc-affiliation", () => HttpResponse.json([mockAff])),
  http.post("/api/saved-npc", async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ...mockNpc, name: body.name }, { status: 201 });
  }),
  http.post("/api/saved-npc/batch", () => HttpResponse.json([mockNpc], { status: 201 })),
  http.patch("/api/saved-npc/:id", async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ...mockNpc, id: params.id as string, ...body });
  }),
  http.delete("/api/saved-npc/:id", () => HttpResponse.json({ success: true })),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ─── Test wrapper ─────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { wrapper: Wrapper, qc };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useSavedNpcs", () => {
  it("fetches and returns saved NPCs", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSavedNpcs(CAMPAIGN), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].name).toBe("Aldric");
  });

  it("does not fetch when campaignId is empty", () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSavedNpcs(""), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useNpcAffiliations", () => {
  it("fetches affiliations", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useNpcAffiliations(CAMPAIGN), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0].name).toBe("Bogrim's Bandits");
  });
});

describe("useSaveSingleNpc", () => {
  it("posts a new saved NPC and returns it", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSaveSingleNpc(CAMPAIGN), { wrapper });
    result.current.mutate(generatedNpc);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe(generatedNpc.name);
  });
});

describe("useSaveBatchNpcs", () => {
  it("posts a batch and returns saved NPCs", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSaveBatchNpcs(CAMPAIGN), { wrapper });
    result.current.mutate({ npcs: [generatedNpc], affiliationName: "Bogrim's Bandits" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});

describe("useUpdateSavedNpc", () => {
  it("patches the NPC and returns updated data", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateSavedNpc(CAMPAIGN), { wrapper });
    result.current.mutate({ id: "npc1", patch: { isDeceased: true } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.isDeceased).toBe(true);
  });
});

describe("useDeleteSavedNpc", () => {
  it("deletes the NPC successfully", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useDeleteSavedNpc(CAMPAIGN), { wrapper });
    result.current.mutate("npc1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
