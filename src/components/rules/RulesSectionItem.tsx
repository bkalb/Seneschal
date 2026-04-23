"use client";

import { useState, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, GripVertical, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/uiStore";
import { useUpdateSection, useDeleteSection, type RulesSection } from "@/hooks/useRulesSections";
import RichTextEditor from "@/components/ui/RichTextEditor";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  section: RulesSection;
}

export default function RulesSectionItem({ section }: Props) {
  const { isSectionCollapsed, toggleSection } = useUIStore();
  const isCollapsed = isSectionCollapsed(section.id);

  const updateSection = useUpdateSection(section.campaignId);
  const deleteSection = useDeleteSection(section.campaignId);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(section.title);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function cycleMode() {
    const order: Array<"BOTH" | "OVERLAND" | "DUNGEON"> = ["BOTH", "OVERLAND", "DUNGEON"];
    const current = (section.applicableModes ?? "BOTH") as "BOTH" | "OVERLAND" | "DUNGEON";
    const next = order[(order.indexOf(current) + 1) % order.length];
    updateSection.mutate({ id: section.id, applicableModes: next });
  }

  const modeLabel: Record<string, string> = { BOTH: "⊕", OVERLAND: "☁", DUNGEON: "⚔" };
  const modeTitle: Record<string, string> = {
    BOTH: "Both modes — click to set Overland only",
    OVERLAND: "Overland only — click to set Dungeon only",
    DUNGEON: "Dungeon only — click to set Both modes",
  };

  const [isEditingContent, setIsEditingContent] = useState(false);
  const [draftContent, setDraftContent] = useState(section.content);

  const titleInputRef = useRef<HTMLInputElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function commitTitle() {
    const trimmed = titleValue.trim();
    if (!trimmed) {
      setTitleValue(section.title);
      setEditingTitle(false);
      return;
    }
    if (trimmed === section.title) {
      setEditingTitle(false);
      return;
    }
    updateSection.mutate(
      { id: section.id, title: trimmed },
      {
        onSuccess: () => setEditingTitle(false),
        onError: () => {
          toast.error("Failed to rename section");
          setTitleValue(section.title);
          setEditingTitle(false);
        },
      }
    );
  }

  function saveContent() {
    updateSection.mutate(
      { id: section.id, content: draftContent },
      {
        onSuccess: () => {
          setIsEditingContent(false);
          toast.success("Section saved");
        },
        onError: () => toast.error("Failed to save section"),
      }
    );
  }

  function cancelContent() {
    setDraftContent(section.content);
    setIsEditingContent(false);
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "rounded-lg border bg-card text-card-foreground shadow-sm transition-shadow",
          isDragging && "shadow-lg opacity-75 ring-2 ring-primary"
        )}
      >
        {/* Header row */}
        <div className="flex items-center gap-1 px-2 py-1.5">
          {/* Drag handle */}
          <Tooltip>
            <TooltipTrigger render={
              <button
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 rounded touch-none"
                aria-label="Drag to reorder"
              >
                <GripVertical className="h-4 w-4" />
              </button>
            } />
            <TooltipContent>Drag to reorder</TooltipContent>
          </Tooltip>

          {/* Collapse toggle */}
          <Tooltip>
            <TooltipTrigger render={
              <button
                onClick={() => toggleSection(section.id)}
                className="text-muted-foreground hover:text-foreground p-1 rounded"
                aria-label={isCollapsed ? "Expand section" : "Collapse section"}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
            } />
            <TooltipContent>{isCollapsed ? "Expand section" : "Collapse section"}</TooltipContent>
          </Tooltip>

          {/* Title */}
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                ref={titleInputRef}
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTitle();
                  if (e.key === "Escape") {
                    setTitleValue(section.title);
                    setEditingTitle(false);
                  }
                }}
                autoFocus
                className="w-full bg-transparent border-b border-primary text-sm font-medium focus:outline-none"
              />
            ) : (
              <span
                className="text-sm font-medium truncate block cursor-pointer hover:text-primary"
                onDoubleClick={() => {
                  setTitleValue(section.title);
                  setEditingTitle(true);
                }}
                title="Double-click to rename"
              >
                {section.title}
              </span>
            )}
          </div>

          {/* Header action buttons — change based on mode */}
          <div className="flex items-center gap-0.5 shrink-0">
            {editingTitle ? (
              // Title edit mode: confirm / cancel title
              <>
                <Tooltip>
                  <TooltipTrigger render={
                    <button
                      onClick={commitTitle}
                      className="p-1 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                      aria-label="Save title"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  } />
                  <TooltipContent>Save title</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger render={
                    <button
                      onClick={() => { setTitleValue(section.title); setEditingTitle(false); }}
                      className="p-1 rounded text-muted-foreground hover:bg-accent"
                      aria-label="Cancel title edit"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  } />
                  <TooltipContent>Discard</TooltipContent>
                </Tooltip>
              </>
            ) : isEditingContent ? (
              // Content edit mode: save / cancel content
              <>
                <Tooltip>
                  <TooltipTrigger render={
                    <button
                      onClick={saveContent}
                      disabled={updateSection.isPending}
                      className="p-1 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-950 disabled:opacity-50"
                      aria-label="Save content"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  } />
                  <TooltipContent>Save content</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger render={
                    <button
                      onClick={cancelContent}
                      disabled={updateSection.isPending}
                      className="p-1 rounded text-muted-foreground hover:bg-accent disabled:opacity-50"
                      aria-label="Cancel content edit"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  } />
                  <TooltipContent>Discard</TooltipContent>
                </Tooltip>
              </>
            ) : (
              // View mode: mode badge, pencil starts content editing, trash deletes
              <div className="flex items-center gap-0.5">
                <button
                  onClick={cycleMode}
                  title={modeTitle[section.applicableModes ?? "BOTH"]}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent text-[11px] font-mono"
                >
                  {modeLabel[section.applicableModes ?? "BOTH"]}
                </button>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                  <Tooltip>
                    <TooltipTrigger render={
                      <button
                        onClick={() => { setDraftContent(section.content); setIsEditingContent(true); if (isCollapsed) toggleSection(section.id); }}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                        aria-label="Edit section content"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    } />
                    <TooltipContent>Edit</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger render={
                      <button
                        onClick={() => setDeleteOpen(true)}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        aria-label="Delete section"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    } />
                    <TooltipContent>Delete section</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Content (collapsible) */}
        <div
          className={cn(
            "overflow-hidden transition-all duration-200",
            isCollapsed ? "max-h-0" : "max-h-[9999px]"
          )}
        >
          <div className="px-3 pb-3 pt-1 border-t">
            <RichTextEditor
              key={`${section.id}-${isEditingContent}`}
              content={isEditingContent ? draftContent : section.content}
              onChange={setDraftContent}
              editable={isEditingContent}
            />
          </div>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{section.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This section and its content will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteSection.mutate(section.id, {
                  onError: () => toast.error("Failed to delete section"),
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
