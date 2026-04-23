"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface Region {
  id: string;
  name: string;
  rerollOnSwitch: boolean;
  regionType: string;
}

interface Campaign {
  id: string;
  regions: Region[];
}

interface Props {
  campaign: Campaign;
  currentDungeonRegionId: string | null;
  onDungeonRegionChange: (regionId: string | null) => void;
}

export default function DungeonRegionSelector({
  campaign,
  currentDungeonRegionId,
  onDungeonRegionChange,
}: Props) {
  const qc = useQueryClient();
  const [regions, setRegions] = useState<Region[]>(campaign.regions);
  const [open, setOpen] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");

  // Only dungeon-type regions
  const dungeonRegions = regions
    .filter((r) => r.regionType === "DUNGEON" || r.regionType === "BOTH")
    .sort((a, b) => a.name.localeCompare(b.name));

  const currentLocation = dungeonRegions.find((r) => r.id === currentDungeonRegionId) ?? null;

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/regions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id, name, regionType: "DUNGEON" }),
      });
      if (!res.ok) throw new Error("Failed to create dungeon location");
      return res.json() as Promise<Region>;
    },
    onSuccess: (region) => {
      setRegions((prev) => [...prev, region]);
      onDungeonRegionChange(region.id);
      qc.invalidateQueries({ queryKey: ["campaign", campaign.id] });
      setAddingNew(false);
      setNewName("");
      setOpen(false);
    },
  });

  function submitAdd() {
    const name = newName.trim();
    if (name) addMutation.mutate(name);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-accent transition-colors"
        title="Dungeon location"
      >
        {/* Dungeon icon */}
        <svg className="w-3.5 h-3.5 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        <span className={currentLocation ? "truncate max-w-[120px]" : "text-muted-foreground"}>
          {currentLocation ? currentLocation.name : "No location"}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setAddingNew(false); }} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg w-52 py-1 text-sm">
            <p className="px-3 py-1 text-xs text-muted-foreground font-medium">Dungeon location</p>

            {currentLocation && (
              <button
                onClick={() => { onDungeonRegionChange(null); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-muted-foreground hover:bg-accent transition-colors"
              >
                — None
              </button>
            )}

            {dungeonRegions.map((r) => (
              <button
                key={r.id}
                onClick={() => { onDungeonRegionChange(r.id); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 hover:bg-accent transition-colors flex items-center justify-between"
              >
                <span className="truncate">{r.name}</span>
                {r.id === currentDungeonRegionId && (
                  <span className="text-xs text-muted-foreground ml-2 shrink-0">✓</span>
                )}
              </button>
            ))}

            {dungeonRegions.length === 0 && !addingNew && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No dungeon locations yet.</p>
            )}

            <div className="border-t border-border mt-1 pt-1">
              {addingNew ? (
                <div className="px-3 py-1.5 space-y-1.5">
                  <input
                    autoFocus
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitAdd();
                      if (e.key === "Escape") { setAddingNew(false); setNewName(""); }
                    }}
                    placeholder="Location name…"
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={submitAdd}
                      disabled={!newName.trim() || addMutation.isPending}
                      className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >{addMutation.isPending ? "Adding…" : "Add"}</button>
                    <button onClick={() => { setAddingNew(false); setNewName(""); }} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingNew(true)}
                  className="w-full text-left px-3 py-1.5 hover:bg-accent transition-colors text-muted-foreground"
                >
                  + Add location…
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
