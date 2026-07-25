import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import React from "react";
import { NpcBrowser } from "@/components/npc/NpcBrowser";
import type { SavedNpcData, NpcAffiliationData } from "@/types/savedNpc";
import { makeSavedNpc } from "@/test/fixtures";

// Mock react-virtual: jsdom has no layout engine, so virtualizer returns zero
// items without this. We replace it with a simple pass-through that renders all rows.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * estimateSize(),
        size: estimateSize(),
      })),
    getTotalSize: () => count * estimateSize(),
  }),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CAMPAIGN = "camp1";

function makeNpc(overrides: Partial<SavedNpcData> = {}): SavedNpcData {
  return makeSavedNpc({ campaignId: CAMPAIGN, ...overrides });
}

const mockAff: NpcAffiliationData = {
  id: "aff1",
  campaignId: CAMPAIGN,
  name: "Bogrim's Bandits",
  createdAt: new Date().toISOString(),
};

let mockNpcs: SavedNpcData[] = [
  makeNpc({ id: "npc1", name: "Aldric", type: "Ruislip", isPinned: true }),
  makeNpc({ id: "npc2", name: "Mira", gender: "female", type: "Ruislip", isDeceased: true }),
  makeNpc({ id: "npc3", name: "Torvin", type: "Ergyng" }),
];

// ─── MSW server ───────────────────────────────────────────────────────────────

const server = setupServer(
  http.get("/api/saved-npc", ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get("search");
    const status = url.searchParams.get("status");

    let results = [...mockNpcs];
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(
        (n) => n.name?.toLowerCase().includes(q) || n.type?.toLowerCase().includes(q)
      );
    }
    if (status === "alive") results = results.filter((n) => !n.isDeceased);
    if (status === "deceased") results = results.filter((n) => n.isDeceased);
    // Pinned always first
    results.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

    return HttpResponse.json(results);
  }),
  http.get("/api/npc-affiliation", () => HttpResponse.json([mockAff])),
  http.patch("/api/saved-npc/:id", async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const npc = mockNpcs.find((n) => n.id === params.id);
    if (!npc) return HttpResponse.json({ error: "Not found" }, { status: 404 });
    const updated = { ...npc, ...body };
    mockNpcs = mockNpcs.map((n) => (n.id === params.id ? updated : n));
    return HttpResponse.json(updated);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ─── Wrapper ─────────────────────────────────────────────────────────────────

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderBrowser(onSelectNpc = vi.fn(), onClose = vi.fn()) {
  return render(
    <Wrapper>
      <NpcBrowser campaignId={CAMPAIGN} onSelectNpc={onSelectNpc} onClose={onClose} />
    </Wrapper>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("NpcBrowser", () => {
  it("renders the panel with heading and close button", () => {
    renderBrowser();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Saved NPCs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close saved npcs browser/i })).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    renderBrowser(vi.fn(), onClose);
    fireEvent.click(screen.getByRole("button", { name: /close saved npcs browser/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    renderBrowser(vi.fn(), onClose);
    // The backdrop is the first div (absolute inset-0) sibling of the panel
    const backdrop = document.querySelector(".fixed.inset-0 > div:first-child");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders loaded NPC rows", async () => {
    renderBrowser();
    await waitFor(() => expect(screen.getByText("Aldric")).toBeInTheDocument());
    expect(screen.getByText("Mira")).toBeInTheDocument();
    expect(screen.getByText("Torvin")).toBeInTheDocument();
  });

  it("shows 'Deceased' badge on deceased NPCs", async () => {
    renderBrowser();
    await waitFor(() => expect(screen.getByText("Mira")).toBeInTheDocument());
    // "Deceased" also appears as a dropdown option, so use getAllByText
    const deceased = screen.getAllByText("Deceased");
    expect(deceased.some((el) => el.tagName.toLowerCase() === "span")).toBe(true);
  });

  it("shows affiliation filter dropdown with affiliations", async () => {
    renderBrowser();
    // Wait for the affiliation data to load and populate the <option>
    await waitFor(() => expect(screen.getByText("Bogrim's Bandits")).toBeInTheDocument());
    expect(screen.getByLabelText("Filter by affiliation")).toBeInTheDocument();
  });

  it("filters results when status filter is changed", async () => {
    renderBrowser();
    await waitFor(() => expect(screen.getByText("Aldric")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "deceased" } });
    await waitFor(() => expect(screen.queryByText("Aldric")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Mira")).toBeInTheDocument());
  });

  it("shows 'no npcs match filters' empty state when a filter is active and results are empty", async () => {
    server.use(
      http.get("/api/saved-npc", ({ request }) => {
        const url = new URL(request.url);
        // Only return empty when status filter is applied
        if (url.searchParams.get("status") === "deceased") return HttpResponse.json([]);
        return HttpResponse.json(mockNpcs);
      })
    );
    renderBrowser();
    await waitFor(() => expect(screen.getByText("Aldric")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "deceased" } });
    await waitFor(() =>
      expect(screen.getByText(/no npcs match your filters/i)).toBeInTheDocument()
    );
  });

  it("shows 'no saved npcs yet' empty state when nothing is saved and no filter is active", async () => {
    server.use(
      http.get("/api/saved-npc", () => HttpResponse.json([]))
    );
    renderBrowser();
    await waitFor(() =>
      expect(screen.getByText(/no saved npcs yet/i)).toBeInTheDocument()
    );
  });

  it("calls onSelectNpc when an NPC row is clicked", async () => {
    const onSelectNpc = vi.fn();
    renderBrowser(onSelectNpc);
    await waitFor(() => expect(screen.getByText("Aldric")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /open aldric/i }));
    expect(onSelectNpc).toHaveBeenCalledWith(expect.objectContaining({ name: "Aldric" }));
  });

  it("pin button is highlighted for pinned NPCs", async () => {
    renderBrowser();
    await waitFor(() => expect(screen.getByText("Aldric")).toBeInTheDocument());
    const pinBtns = screen.getAllByRole("button", { name: /pin/i });
    // Aldric is pinned — first row after sort should have "Unpin NPC" label
    expect(pinBtns.some((b) => b.getAttribute("aria-label") === "Unpin NPC")).toBe(true);
  });

  it("renders a virtualized list container", async () => {
    renderBrowser();
    // Wait for data to load, then check the virtual container
    await waitFor(() => expect(screen.getByText("Aldric")).toBeInTheDocument());
    expect(screen.getByLabelText("NPC list")).toBeInTheDocument();
    expect(screen.getByLabelText("Virtualized NPC rows")).toBeInTheDocument();
  });

  it("renders the search input", () => {
    renderBrowser();
    expect(screen.getByRole("textbox", { name: /search saved npcs/i })).toBeInTheDocument();
  });

  it("renders the sort controls", () => {
    renderBrowser();
    expect(screen.getByLabelText("Sort by")).toBeInTheDocument();
    expect(screen.getByLabelText(/sorted/i)).toBeInTheDocument();
  });
});
