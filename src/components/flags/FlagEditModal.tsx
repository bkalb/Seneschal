"use client";

import { useState } from "react";
import type { CampaignFlag } from "@/hooks/useFlags";
import { FLAG_COLORS } from "./FlagStrip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SaveData {
  label: string;
  color: string;
  counter: number | null;
  countDirection: "up" | "down" | null;
  paused: boolean;
}

interface Props {
  flag?: CampaignFlag;
  onSave: (data: SaveData) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export function FlagEditModal({ flag, onSave, onDelete, onClose }: Props) {
  const [label, setLabel] = useState(flag?.label ?? "");
  const [color, setColor] = useState(flag?.color ?? FLAG_COLORS[0].value);
  const [hasCounter, setHasCounter] = useState(flag?.counter !== null && flag?.counter !== undefined);
  const [counter, setCounter] = useState<number>(flag?.counter ?? 0);
  const [countDirection, setCountDirection] = useState<"up" | "down">(flag?.countDirection ?? "down");
  const [paused, setPaused] = useState(flag?.paused ?? false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isNew = !flag;

  async function handleSave() {
    if (!label.trim()) return;
    setSaving(true);
    await onSave({
      label: label.trim(),
      color,
      counter: hasCounter ? counter : null,
      countDirection: hasCounter ? countDirection : null,
      paused: hasCounter ? paused : false,
    });
    setSaving(false);
  }

  async function handleDelete() {
    if (!onDelete) return;
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isNew ? "New Flag" : "Edit Flag"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {/* Label */}
          <div className="space-y-1">
            <Label htmlFor="flag-label" className="text-xs text-muted-foreground">Label</Label>
            <Input
              id="flag-label"
              autoFocus
              type="text"
              placeholder="e.g. Grix Concussed"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            />
          </div>

          {/* Color */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2">Color</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {FLAG_COLORS.map((c) => (
                <button
                  key={c.value}
                  title={c.label}
                  onClick={() => setColor(c.value)}
                  className={[
                    "w-6 h-6 rounded-full border-2 transition-transform hover:scale-110",
                    color === c.value ? "border-foreground scale-110" : "border-transparent",
                  ].join(" ")}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Preview:</span>
            <span
              className="px-2.5 py-0.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: color, color: "#000" }}
            >
              {label || "Flag label"}
              {hasCounter && (
                <span className="ml-1 opacity-70">
                  {countDirection === "up" ? "↑" : "↓"}{counter}
                </span>
              )}
            </span>
          </div>

          {/* Counter toggle */}
          <div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={hasCounter}
                onChange={(e) => setHasCounter(e.target.checked)}
                className="rounded"
              />
              Track a counter
            </label>
          </div>

          {hasCounter && (
            <div className="space-y-3 pl-4 border-l-2 border-border">

              {/* Direction */}
              <div className="flex gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="dir"
                    checked={countDirection === "down"}
                    onChange={() => setCountDirection("down")}
                  />
                  <span>Count down ↓</span>
                  <span className="text-xs text-muted-foreground">(e.g. days remaining)</span>
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="dir"
                    checked={countDirection === "up"}
                    onChange={() => setCountDirection("up")}
                  />
                  <span>Count up ↑</span>
                  <span className="text-xs text-muted-foreground">(e.g. days elapsed)</span>
                </label>
              </div>

              {/* Starting value */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {isNew ? "Starting value" : "Current value"}
                </Label>
                <Input
                  type="number"
                  className="w-24"
                  value={counter}
                  min={0}
                  onChange={(e) => setCounter(Math.max(0, parseInt(e.target.value) || 0))}
                />
              </div>

              {/* Pause */}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={paused}
                  onChange={(e) => setPaused(e.target.checked)}
                  className="rounded"
                />
                Pause counter (won't tick on day advance)
              </label>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <div>
            {onDelete && (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-destructive">Delete this flag?</span>
                  <Button
                    variant="destructive"
                    size="xs"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? "…" : "Yes"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setConfirmDelete(false)}
                  >
                    No
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  Delete
                </Button>
              )
            )}
          </div>

          <div className="flex items-center gap-2">
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </DialogClose>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!label.trim() || saving}
            >
              {saving ? "Saving…" : isNew ? "Create" : "Save"}
            </Button>
          </div>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
