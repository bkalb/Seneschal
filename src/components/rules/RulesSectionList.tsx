"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import RulesSectionItem from "./RulesSectionItem";
import {
  useRulesSections,
  useCreateSection,
  useReorderSections,
  type RulesSection,
} from "@/hooks/useRulesSections";

interface Props {
  campaignId: string;
  mode?: string; // "OVERLAND" | "DUNGEON"
  filterByMode?: boolean;
}

export default function RulesSectionList({ campaignId, mode, filterByMode = false }: Props) {
  const { data: sections, isLoading } = useRulesSections(campaignId);
  const createSection = useCreateSection(campaignId);
  const reorderSections = useReorderSections(campaignId);

  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  // Local ordering state for optimistic drag-and-drop
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);

  const allSections: RulesSection[] = localOrder
    ? (localOrder
        .map((id) => sections?.find((s) => s.id === id))
        .filter(Boolean) as RulesSection[])
    : (sections ?? []);

  // Only filter by mode when explicitly enabled (filterByMode=true).
  // In the default management view, show all sections so none appear to vanish.
  const orderedSections = (filterByMode && mode)
    ? allSections.filter((s) => {
        const m = s.applicableModes ?? "BOTH";
        return m === "BOTH" || m === mode;
      })
    : allSections;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = orderedSections.map((s) => s.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    const newOrder = arrayMove(ids, oldIndex, newIndex);

    setLocalOrder(newOrder);
    reorderSections.mutate(newOrder, {
      onError: () => {
        setLocalOrder(null);
        toast.error("Failed to save order");
      },
      onSuccess: () => setLocalOrder(null),
    });
  }

  function handleCreate() {
    const title = newTitle.trim();
    if (!title) return;
    createSection.mutate(title, {
      onSuccess: () => {
        setCreateOpen(false);
        setNewTitle("");
        toast.success("Section created");
      },
      onError: () => toast.error("Failed to create section"),
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={orderedSections.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          {orderedSections.map((section) => (
            <div key={section.id} className="group">
              <RulesSectionItem section={section} />
            </div>
          ))}
        </SortableContext>
      </DndContext>

      {orderedSections.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No sections yet. Add one to get started.
        </p>
      )}

      <Button
        variant="outline"
        size="sm"
        className="mt-1 w-full gap-1.5 border-dashed"
        onClick={() => {
          setNewTitle("");
          setCreateOpen(true);
        }}
      >
        <Plus className="h-4 w-4" />
        Add section
      </Button>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Section</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="section-title">Title</Label>
            <Input
              id="section-title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="e.g. Combat rules, Encounter procedure…"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newTitle.trim() || createSection.isPending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
