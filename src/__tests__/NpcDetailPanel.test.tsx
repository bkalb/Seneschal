import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import React from "react";
import { NpcDetailPanel } from "@/components/npc/NpcDetailPanel";
import type { SavedNpcData, NpcAffiliationData } from "@/types/savedNpc";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CAMPAIGN = "camp1";

const mockNpc: SavedNpcData = {
  id: "npc1",
  campaignId: CAMPAIGN,
  affiliationId: "aff1",
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
  notes: "Main antagonist",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const affiliations: NpcAffiliationData[] = [
  { id: "aff1", campaignId: CAMPAIGN, name: "Bogrim's Bandits", createdAt: new Date().toISOString() },
];

// ─── MSW server ───────────────────────────────────────────────────────────────

const server = setupServer(
  http.patch("/api/saved-npc/:id", async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ...mockNpc, id: params.id as string, ...body });
  }),
  http.delete("/api/saved-npc/:id", () => HttpResponse.json({ success: true })),
  http.post("/api/npc-affiliation", async ({ request }) => {
    const body = await request.json() as { name?: string };
    return HttpResponse.json(
      { id: "aff2", campaignId: CAMPAIGN, name: body.name ?? "New", createdAt: new Date().toISOString() },
      { status: 201 }
    );
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

function renderDetail(
  npc = mockNpc,
  onClose = vi.fn(),
  onDeleted = vi.fn()
) {
  return render(
    <Wrapper>
      <NpcDetailPanel
        npc={npc}
        affiliations={affiliations}
        campaignId={CAMPAIGN}
        onClose={onClose}
        onDeleted={onDeleted}
      />
    </Wrapper>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("NpcDetailPanel", () => {
  it("renders the NPC name in the header", () => {
    renderDetail();
    expect(screen.getByRole("dialog", { name: /aldric/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Aldric" })).toBeInTheDocument();
  });

  it("renders all editable fields with current values", () => {
    renderDetail();
    expect(screen.getByRole("button", { name: /edit name/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit homeland/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit age/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit weapon/i })).toBeInTheDocument();
  });

  it("enters edit mode when a field is clicked", () => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /edit name: aldric/i }));
    expect(screen.getByRole("textbox", { name: /edit name/i })).toBeInTheDocument();
  });

  it("cancels edit and restores original value", () => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /edit name: aldric/i }));
    const input = screen.getByRole("textbox", { name: /edit name/i });
    fireEvent.change(input, { target: { value: "Changed Name" } });
    fireEvent.click(screen.getByRole("button", { name: /cancel editing name/i }));
    expect(screen.queryByRole("textbox", { name: /edit name/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit name: aldric/i })).toBeInTheDocument();
  });

  it("submits field edit on Enter key and calls API", async () => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /edit name: aldric/i }));
    const input = screen.getByRole("textbox", { name: /edit name/i });
    fireEvent.change(input, { target: { value: "Aldric the Bold" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.queryByRole("textbox", { name: /edit name/i })).not.toBeInTheDocument());
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    renderDetail(mockNpc, onClose);
    fireEvent.click(screen.getByRole("button", { name: /close npc detail/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows current affiliation name", () => {
    renderDetail();
    expect(screen.getByText(/currently: bogrim's bandits/i)).toBeInTheDocument();
  });

  it("shows the notes textarea with current value", () => {
    renderDetail();
    expect(screen.getByRole("textbox", { name: /npc notes/i })).toHaveValue("Main antagonist");
  });

  it("shows pin/unpin button", () => {
    renderDetail();
    expect(screen.getByRole("button", { name: /pin npc/i })).toBeInTheDocument();
  });

  it("toggles pin when pin button is clicked", async () => {
    let patchBody: Record<string, unknown> = {};
    server.use(
      http.patch("/api/saved-npc/:id", async ({ request }) => {
        patchBody = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ ...mockNpc, ...patchBody });
      })
    );
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /pin npc/i }));
    await waitFor(() => expect(patchBody.isPinned).toBe(true));
  });

  it("shows 'Mark Deceased' button for living NPC", () => {
    renderDetail();
    expect(screen.getByRole("button", { name: /mark npc as deceased/i })).toBeInTheDocument();
  });

  it("shows 'Mark Alive' button for deceased NPC", () => {
    renderDetail({ ...mockNpc, isDeceased: true });
    expect(screen.getByRole("button", { name: /mark npc as alive/i })).toBeInTheDocument();
  });

  it("calls API to mark deceased", async () => {
    let patchBody: Record<string, unknown> = {};
    server.use(
      http.patch("/api/saved-npc/:id", async ({ request }) => {
        patchBody = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ ...mockNpc, ...patchBody });
      })
    );
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /mark npc as deceased/i }));
    await waitFor(() => expect(patchBody.isDeceased).toBe(true));
  });

  it("shows delete button and confirmation dialog", () => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /delete npc/i }));
    expect(screen.getByRole("button", { name: /confirm delete npc/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel delete/i })).toBeInTheDocument();
  });

  it("cancels delete when cancel is clicked", () => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /delete npc/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel delete/i }));
    expect(screen.queryByRole("button", { name: /confirm delete npc/i })).not.toBeInTheDocument();
  });

  it("calls onDeleted after confirmed delete", async () => {
    const onDeleted = vi.fn();
    renderDetail(mockNpc, vi.fn(), onDeleted);
    fireEvent.click(screen.getByRole("button", { name: /delete npc/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm delete npc/i }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
  });
});
