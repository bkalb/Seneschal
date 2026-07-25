"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useFlags, useCreateFlag, useUpdateFlag, useDeleteFlag, type CampaignFlag } from "@/hooks/useFlags";
import { FlagEditModal } from "./FlagEditModal";

export const FLAG_COLORS: { label: string; value: string }[] = [
  { label: "Rose",    value: "#fecdd3" },
  { label: "Pink",    value: "#fbcfe8" },
  { label: "Fuchsia", value: "#f5d0fe" },
  { label: "Purple",  value: "#e9d5ff" },
  { label: "Violet",  value: "#ddd6fe" },
  { label: "Indigo",  value: "#c7d2fe" },
  { label: "Blue",    value: "#bfdbfe" },
  { label: "Sky",     value: "#bae6fd" },
  { label: "Cyan",    value: "#a5f3fc" },
  { label: "Teal",    value: "#99f6e4" },
  { label: "Green",   value: "#bbf7d0" },
  { label: "Lime",    value: "#d9f99d" },
  { label: "Yellow",  value: "#fef08a" },
  { label: "Amber",   value: "#fde68a" },
  { label: "Orange",  value: "#fed7aa" },
  { label: "Slate",   value: "#e2e8f0" },
];

interface Props {
  campaignId: string;
  initialFlags: CampaignFlag[];
}

export function FlagStrip({ campaignId, initialFlags }: Props) {
  const { data: flags = initialFlags } = useFlags(campaignId);
  const createMutation = useCreateFlag(campaignId);
  const updateMutation = useUpdateFlag(campaignId);
  const deleteMutation = useDeleteFlag(campaignId);

  const [editingFlag, setEditingFlag] = useState<CampaignFlag | null>(null);
  const [showNew, setShowNew] = useState(false);

  const sorted = flags.slice().sort((a, b) => a.sortOrder - b.sortOrder);

  async function moveFlag(flag: CampaignFlag, dir: -1 | 1) {
    const idx = sorted.findIndex((f) => f.id === flag.id);
    const neighbor = sorted[idx + dir];
    if (!neighbor) return;
    // Swap sort orders sequentially to avoid racing, interleaved invalidations
    try {
      await updateMutation.mutateAsync({ id: flag.id, sortOrder: neighbor.sortOrder });
      await updateMutation.mutateAsync({ id: neighbor.id, sortOrder: flag.sortOrder });
    } catch {
      toast.error("Failed to reorder flag");
    }
  }

  function adjustCounter(flag: CampaignFlag, delta: 1 | -1) {
    if (flag.counter === null) return;
    const newValue = Math.max(0, flag.counter + delta);
    updateMutation.mutate(
      { id: flag.id, counter: newValue },
      { onError: () => toast.error("Failed to update flag") }
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background/80 flex-wrap">
        {sorted.map((flag, idx) => (
          <FlagChip
            key={flag.id}
            flag={flag}
            isFirst={idx === 0}
            isLast={idx === sorted.length - 1}
            onEdit={() => setEditingFlag(flag)}
            onDelete={() => deleteMutation.mutate(flag.id, { onError: () => toast.error("Failed to delete flag") })}
            onMoveLeft={() => moveFlag(flag, -1)}
            onMoveRight={() => moveFlag(flag, 1)}
            onIncrement={() => adjustCounter(flag, 1)}
            onDecrement={() => adjustCounter(flag, -1)}
          />
        ))}

        {/* Add flag button */}
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-dashed border-border text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add flag
        </button>
      </div>

      {/* Edit existing flag */}
      {editingFlag && (
        <FlagEditModal
          flag={editingFlag}
          onSave={async (data) => {
            try {
              await updateMutation.mutateAsync({ id: editingFlag.id, ...data });
              setEditingFlag(null);
            } catch {
              toast.error("Failed to update flag");
            }
          }}
          onDelete={async () => {
            try {
              await deleteMutation.mutateAsync(editingFlag.id);
              setEditingFlag(null);
            } catch {
              toast.error("Failed to delete flag");
            }
          }}
          onClose={() => setEditingFlag(null)}
        />
      )}

      {/* Create new flag */}
      {showNew && (
        <FlagEditModal
          onSave={async (data) => {
            try {
              await createMutation.mutateAsync(data);
              setShowNew(false);
            } catch {
              toast.error("Failed to create flag");
            }
          }}
          onClose={() => setShowNew(false)}
        />
      )}
    </>
  );
}

// ─── Flag Chip ────────────────────────────────────────────────────────────────

interface ChipProps {
  flag: CampaignFlag;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}

function FlagChip({ flag, isFirst, isLast, onEdit, onDelete, onMoveLeft, onMoveRight, onIncrement, onDecrement }: ChipProps) {
  const atZero = flag.countDirection === "down" && flag.counter === 0;
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      className={[
        "group flex items-center gap-0.5 pl-2 pr-0.5 py-0.5 rounded-full text-xs font-medium select-none",
        atZero ? "ring-2 ring-offset-1 ring-amber-400 animate-pulse" : "",
      ].join(" ")}
      style={{ backgroundColor: flag.color, color: "#000" }}
    >
      {/* Reorder left */}
      {!isFirst && (
        <button
          onClick={onMoveLeft}
          className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-0.5 rounded"
          title="Move left"
        >
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Label + counter */}
      <span className="whitespace-nowrap px-0.5">{flag.label}</span>

      {flag.counter !== null && (
        <span className="flex items-center gap-0.5">
          <button
            onClick={onDecrement}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10"
            title="Decrement counter"
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14" />
            </svg>
          </button>
          {flag.countDirection === "up" ? (
            <svg className="w-2.5 h-2.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
            </svg>
          ) : (
            <svg className="w-2.5 h-2.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          )}
          <span className={atZero ? "font-bold" : ""}>{flag.counter}</span>
          <button
            onClick={onIncrement}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10"
            title="Increment counter"
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14M5 12h14" />
            </svg>
          </button>
          {flag.paused && <span className="opacity-50">⏸</span>}
        </span>
      )}

      {/* Edit + delete buttons */}
      {confirmDelete ? (
        <span className="flex items-center gap-0.5 ml-0.5">
          <button
            onClick={onDelete}
            className="p-0.5 rounded text-red-700 hover:bg-black/10 transition-colors"
            title="Confirm delete"
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="p-0.5 rounded hover:bg-black/10 transition-colors opacity-60 hover:opacity-100"
            title="Cancel"
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      ) : (
        <span className="flex items-center gap-0 ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-0.5 rounded hover:bg-black/10 transition-colors opacity-60 hover:opacity-100"
            title="Edit flag"
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-0.5 rounded hover:bg-black/10 transition-colors opacity-60 hover:opacity-100"
            title="Delete flag"
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      )}

      {/* Reorder right */}
      {!isLast && (
        <button
          onClick={onMoveRight}
          className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-0.5 rounded"
          title="Move right"
        >
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}
