"use client";

import type { GeneratedNpc, NpcField } from "@/types/npc";
import type { NpcResultSet } from "@/types/npcHistory";
import type { RandomTable } from "@/types/table";
import { NpcCard } from "./NpcCard";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";
import { PinIcon, XIcon } from "lucide-react";

interface Props {
  set: NpcResultSet;
  /** Tables available for re-roll, threaded down from `NpcPanel` (§9.6). */
  tableMap: Map<string, RandomTable>;
  onSaveSingle: (index: number, npc: GeneratedNpc) => void;
  onSaveBatch: () => void;
  onTogglePin: () => void;
  onDismiss: () => void;
  onRerollCard: (index: number, npc: GeneratedNpc) => void;
  onRerollField: (index: number, npc: GeneratedNpc, field: NpcField) => void;
  isSavingSingle: boolean;
}

/** "2:14 PM" for today, "Jul 20, 2:14 PM" otherwise (§9.4). */
function formatSetTime(createdAt: number): string {
  const d = new Date(createdAt);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (isToday) return time;
  const datePart = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${datePart}, ${time}`;
}

/** One history entry: sticky header (§9.4) + card grid (§9.5). */
export function NpcResultSetView({
  set,
  tableMap,
  onSaveSingle,
  onSaveBatch,
  onTogglePin,
  onDismiss,
  onRerollCard,
  onRerollField,
  isSavingSingle,
}: Props) {
  // In-game date and region segments are omitted entirely when null (§9.4).
  const metaParts = [formatSetTime(set.createdAt)];
  if (set.inGameDateLabel) metaParts.push(set.inGameDateLabel);
  if (set.regionName) metaParts.push(set.regionName);

  return (
    <div className="space-y-1.5">
      {/* Sticky set header — solid background so cards scrolling underneath don't show through. */}
      <div className="sticky top-0 z-10 bg-card border-b border-border/60 pb-1 pt-0.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground truncate">{metaParts.join(" · ")}</p>
          <div className="flex items-center gap-0.5 shrink-0">
            <IconButton
              variant="ghost"
              size="icon-xs"
              onClick={onTogglePin}
              tooltip={set.pinned ? "Unpin set" : "Pin set"}
              aria-label={set.pinned ? "Unpin set" : "Pin set"}
              className={cn(set.pinned ? "text-amber-500 hover:text-amber-400" : "text-muted-foreground")}
            >
              <PinIcon fill={set.pinned ? "currentColor" : "none"} />
            </IconButton>
            {set.npcs.length > 1 && (
              <Button
                variant="ghost"
                size="xs"
                onClick={onSaveBatch}
                className="text-muted-foreground"
                aria-label="Save all NPCs in this set as a group"
              >
                Save as Group…
              </Button>
            )}
            <IconButton variant="ghost" size="icon-xs" onClick={onDismiss} tooltip="Dismiss set" aria-label="Dismiss set">
              <XIcon />
            </IconButton>
          </div>
        </div>
        <p className="text-[10px] font-semibold text-foreground">
          {set.profileName} · {set.npcs.length} NPC{set.npcs.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Card grid — each set independently chooses its layout (§9.5). */}
      <div className={cn(set.npcs.length > 1 ? "grid grid-cols-2 gap-2 content-start" : "space-y-2")}>
        {set.npcs.map((npc, idx) => (
          <NpcCard
            key={idx}
            npc={npc}
            showIndex={set.npcs.length > 1}
            index={idx}
            tableMap={tableMap}
            onSave={() => onSaveSingle(idx, npc)}
            isSaving={isSavingSingle}
            onRerollCard={() => onRerollCard(idx, npc)}
            onRerollField={(field) => onRerollField(idx, npc, field)}
          />
        ))}
      </div>
    </div>
  );
}
