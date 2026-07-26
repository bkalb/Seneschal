import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { SaveBatchDialog } from "@/components/npc/SaveBatchDialog";
import type { GeneratedNpc } from "@/types/npc";
import type { NpcAffiliationData } from "@/types/savedNpc";

const makeNpc = (name: string, type = "Ruislip"): GeneratedNpc => ({
  name,
  gender: "male",
  age: "30",
  type,
  typeLabel: "Homeland",
  secondaryType: null,
  secondaryTypeLabel: null,
  physical: [],
  personality: [],
  details: [],
});

const affiliations: NpcAffiliationData[] = [
  { id: "aff1", campaignId: "camp1", name: "Bogrim's Bandits", createdAt: new Date().toISOString() },
];

const npcs = [makeNpc("Aldric"), makeNpc("Mira"), makeNpc("Torvin")];

describe("SaveBatchDialog", () => {
  it("renders all NPCs pre-selected", () => {
    render(
      <SaveBatchDialog
        npcs={npcs}
        affiliations={affiliations}
        isSaving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const checkboxes = screen.getAllByRole("checkbox");
    // 1 select-all + 3 NPC checkboxes
    expect(checkboxes).toHaveLength(4);
    checkboxes.forEach((cb) => expect(cb).toBeChecked());
  });

  it("shows correct count label on save button", () => {
    render(
      <SaveBatchDialog
        npcs={npcs}
        affiliations={affiliations}
        isSaving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /save 3 of 3/i })).toBeInTheDocument();
  });

  it("deselecting an NPC updates the count label", () => {
    render(
      <SaveBatchDialog
        npcs={npcs}
        affiliations={affiliations}
        isSaving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Uncheck the first NPC (Aldric)
    fireEvent.click(screen.getByLabelText("Include Aldric"));
    expect(screen.getByRole("button", { name: /save 2 of 3/i })).toBeInTheDocument();
  });

  it("toggle-all deselects all when all are selected", () => {
    render(
      <SaveBatchDialog
        npcs={npcs}
        affiliations={affiliations}
        isSaving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText("Select all NPCs"));
    const npcCheckboxes = screen.getAllByRole("checkbox").slice(1); // skip select-all
    npcCheckboxes.forEach((cb) => expect(cb).not.toBeChecked());
  });

  it("calls onSave with selected NPCs and affiliation name", () => {
    const onSave = vi.fn();
    render(
      <SaveBatchDialog
        npcs={npcs}
        affiliations={affiliations}
        isSaving={false}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    // Deselect Torvin
    fireEvent.click(screen.getByLabelText("Include Torvin"));

    // Enter affiliation
    fireEvent.change(screen.getByLabelText("Affiliation name"), {
      target: { value: "Bogrim's Bandits" },
    });

    // Click save
    fireEvent.click(screen.getByRole("button", { name: /save 2 of 3/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: "Aldric" }),
        expect.objectContaining({ name: "Mira" }),
      ]),
      "Bogrim's Bandits"
    );
    expect(onSave).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: "Torvin" })]),
      expect.anything()
    );
  });

  it("save button is disabled when no NPCs are selected", () => {
    render(
      <SaveBatchDialog
        npcs={npcs}
        affiliations={affiliations}
        isSaving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Deselect all
    fireEvent.click(screen.getByLabelText("Select all NPCs"));

    const saveBtn = screen.getByRole("button", { name: /save 0 of 3/i });
    expect(saveBtn).toBeDisabled();
  });

  it("shows saving state on button", () => {
    render(
      <SaveBatchDialog
        npcs={npcs}
        affiliations={affiliations}
        isSaving={true}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Saving…")).toBeInTheDocument();
  });

  it("calls onClose when the footer Close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <SaveBatchDialog
        npcs={npcs}
        affiliations={affiliations}
        isSaving={false}
        onSave={vi.fn()}
        onClose={onClose}
      />
    );
    // Two elements are named "Close": the corner icon button and the footer
    // button rendered by DialogFooter's showCloseButton. Scope to the footer.
    const footer = document.querySelector('[data-slot="dialog-footer"]')!;
    fireEvent.click(within(footer as HTMLElement).getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onSave with undefined affiliationName when input is blank", () => {
    const onSave = vi.fn();
    render(
      <SaveBatchDialog
        npcs={npcs}
        affiliations={[]}
        isSaving={false}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /save 3 of 3/i }));
    expect(onSave).toHaveBeenCalledWith(npcs, undefined);
  });
});
