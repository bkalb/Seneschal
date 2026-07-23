"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRandomTables } from "@/hooks/useRandomTables";

interface Region {
  id: string;
  name: string;
  rerollOnSwitch: boolean;
  regionType: string;
}

interface Campaign {
  id: string;
  state: {
    currentRegionId: string | null;
    currentDate: string;
    mode?: string;
    currentTime?: string;
    currentDungeonRegionId?: string | null;
    currentRegion: Region | null;
  } | null;
  regions: Region[];
}

interface Props {
  campaign: Campaign;
  onRegionChange: (regionId: string | null) => void;
}

export default function RegionSelector({ campaign, onRegionChange }: Props) {
  const qc = useQueryClient();

  // Local state — updated immediately on mutation success
  const [regions, setRegions] = useState<Region[]>(campaign.regions);
  const [currentRegionId, setCurrentRegionId] = useState<string | null>(
    campaign.state?.currentRegionId ?? null
  );
const [open, setOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameRerollOnSwitch, setRenameRerollOnSwitch] = useState(false);
  const [renameRegionType, setRenameRegionType] = useState<"OVERLAND" | "DUNGEON" | "BOTH">("OVERLAND");
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [showFromTable, setShowFromTable] = useState(false);

  const currentRegion = regions.find((r) => r.id === currentRegionId) ?? null;

  // ── Set current region ────────────────────────────────────────────────────

  const setRegionMutation = useMutation({
    mutationFn: async (regionId: string | null) => {
      const res = await fetch("/api/campaign-state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id, currentRegionId: regionId }),
      });
      if (!res.ok) throw new Error("Failed to update region");
      return res.json();
    },
    onSuccess: (_data, regionId) => {
      setCurrentRegionId(regionId);
      onRegionChange(regionId);
      qc.invalidateQueries({ queryKey: ["campaign", campaign.id] });
    },
    onError: () => toast.error("Failed to change region"),
  });

  // ── Add region ────────────────────────────────────────────────────────────

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/regions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id, name }),
      });
      if (!res.ok) throw new Error("Failed to create region");
      return res.json() as Promise<Region>;
    },
    onSuccess: (region) => {
      setRegions((prev) => [...prev, region].sort((a, b) => a.name.localeCompare(b.name)));
      setCurrentRegionId(region.id);
      setRegionMutation.mutate(region.id);
      setAddingNew(false);
      setNewName("");
    },
    onError: () => toast.error("Failed to add region"),
  });

  // ── Rename region ─────────────────────────────────────────────────────────

  const renameMutation = useMutation({
    mutationFn: async ({ id, name, rerollOnSwitch, regionType }: { id: string; name: string; rerollOnSwitch: boolean; regionType: string }) => {
      const res = await fetch(`/api/regions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rerollOnSwitch, regionType }),
      });
      if (!res.ok) throw new Error("Failed to rename region");
      return res.json() as Promise<Region>;
    },
    onSuccess: (updated) => {
      setRegions((prev) => prev.map((r) => r.id === updated.id ? updated : r));
      setRenamingId(null);
    },
    onError: () => toast.error("Failed to rename region"),
  });

  function startRename(r: Region) {
    setConfirmDeleteId(null);
    setRenamingId(r.id);
    setRenameValue(r.name);
    setRenameRerollOnSwitch(r.rerollOnSwitch);
    setRenameRegionType((r.regionType as "OVERLAND" | "DUNGEON" | "BOTH") ?? "OVERLAND");
  }

  function submitRename(id: string) {
    const name = renameValue.trim();
    if (name) renameMutation.mutate({ id, name, rerollOnSwitch: renameRerollOnSwitch, regionType: renameRegionType });
  }

  // ── Delete region ─────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/regions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete region");
    },
    onSuccess: (_data, id) => {
      setRegions((prev) => prev.filter((r) => r.id !== id));
      if (currentRegionId === id) {
        setCurrentRegionId(null);
        setRegionMutation.mutate(null);
      }
      setConfirmDeleteId(null);
    },
    onError: () => toast.error("Failed to delete region"),
  });

  function submitAdd() {
    const name = newName.trim();
    if (name) addMutation.mutate(name);
  }

  // Overland selector only shows OVERLAND and BOTH regions
  const sorted = regions
    .filter((r) => r.regionType === "OVERLAND" || r.regionType === "BOTH")
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        onClick={() => { setOpen((v) => !v); setConfirmDeleteId(null); setRenamingId(null); setAddingNew(false); setShowFromTable(false); }}
        className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-accent transition-colors"
      >
        <svg className="w-3.5 h-3.5 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className={currentRegion ? "truncate max-w-[140px]" : "text-muted-foreground"}>
          {currentRegion ? currentRegion.name : "No region"}
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setRenamingId(null); }} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg w-56 py-1 text-sm">
            <p className="px-3 py-1 text-xs text-muted-foreground font-medium">Current region</p>

            {currentRegion && (
              <button
                onClick={() => { setRegionMutation.mutate(null); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-muted-foreground hover:bg-accent transition-colors"
              >
                — None
              </button>
            )}

            {sorted.map((r) => (
              <div key={r.id} className="flex items-center group">
                {renamingId === r.id ? (
                  <div className="px-3 py-1.5 w-full space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitRename(r.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        onClick={() => submitRename(r.id)}
                        disabled={!renameValue.trim() || renameMutation.isPending}
                        className="text-xs px-1.5 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >Save</button>
                      <button
                        onClick={() => setRenamingId(null)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >✕</button>
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={renameRerollOnSwitch}
                        onChange={(e) => setRenameRerollOnSwitch(e.target.checked)}
                        className="rounded border-border"
                      />
                      <span className="text-xs text-muted-foreground">Re-roll on switch</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Type:</span>
                      <select
                        value={renameRegionType}
                        onChange={(e) => setRenameRegionType(e.target.value as "OVERLAND" | "DUNGEON" | "BOTH")}
                        className="flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="OVERLAND">Overland</option>
                        <option value="DUNGEON">Dungeon</option>
                        <option value="BOTH">Both</option>
                      </select>
                    </div>
                  </div>
                ) : confirmDeleteId === r.id ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 w-full">
                    <span className="text-xs text-destructive flex-1">Delete "{r.name}"?</span>
                    <button
                      onClick={() => deleteMutation.mutate(r.id)}
                      disabled={deleteMutation.isPending}
                      className="text-xs px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                    >Yes</button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >No</button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => { setRegionMutation.mutate(r.id); setOpen(false); }}
                      className="flex-1 text-left px-3 py-1.5 hover:bg-accent transition-colors flex items-center justify-between"
                    >
                      <span className="truncate">{r.name}</span>
                      {r.id === currentRegionId && (
                        <span className="text-xs text-muted-foreground ml-2 shrink-0">✓</span>
                      )}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); startRename(r); }}
                      className="px-1.5 py-1.5 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Rename region"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(r.id); }}
                      className="px-1.5 py-1.5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete region"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            ))}

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
                    placeholder="Region name…"
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
              ) : showFromTable ? (
                <FromTablePicker
                  campaignId={campaign.id}
                  existingNames={new Set(regions.map((r) => r.name))}
                  onImport={(newRegions) => {
                    setRegions((prev) => [...prev, ...newRegions].sort((a, b) => a.name.localeCompare(b.name)));
                    setShowFromTable(false);
                  }}
                  onCancel={() => setShowFromTable(false)}
                />
              ) : (
                <>
                  <button
                    onClick={() => setAddingNew(true)}
                    className="w-full text-left px-3 py-1.5 hover:bg-accent transition-colors text-muted-foreground"
                  >
                    + Add region…
                  </button>
                  <button
                    onClick={() => setShowFromTable(true)}
                    className="w-full text-left px-3 py-1.5 hover:bg-accent transition-colors text-muted-foreground"
                  >
                    + From table…
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}

    </div>
  );
}

// ─── From Table Picker ────────────────────────────────────────────────────────

interface FromTablePickerProps {
  campaignId: string;
  existingNames: Set<string>;
  onImport: (regions: Region[]) => void;
  onCancel: () => void;
}

function FromTablePicker({ campaignId, existingNames, onImport, onCancel }: FromTablePickerProps) {
  const { data: tables = [], isLoading } = useRandomTables(campaignId);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [importing, setImporting] = useState(false);

  const sorted = tables.slice().sort((a, b) => a.name.localeCompare(b.name));
  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;
  const newOutcomes = selectedTable
    ? [...new Set(selectedTable.rows.map((r) => r.outcome.trim()))].filter((o) => !existingNames.has(o))
    : [];

  async function handleImport() {
    if (!selectedTable || newOutcomes.length === 0) return;
    setImporting(true);
    const created: Region[] = [];
    for (const name of newOutcomes) {
      const res = await fetch("/api/regions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, name }),
      });
      if (res.ok) created.push(await res.json());
    }
    setImporting(false);
    onImport(created);
  }

  return (
    <div className="px-3 py-2 space-y-2">
      <p className="text-xs text-muted-foreground font-medium">Import regions from table</p>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <select
          value={selectedTableId}
          onChange={(e) => setSelectedTableId(e.target.value)}
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Select a table…</option>
          {sorted.map((t) => (
            <option key={t.id} value={t.id}>{t.name} ({t.rows.length} rows)</option>
          ))}
        </select>
      )}
      {selectedTable && (
        <p className="text-xs text-muted-foreground">
          {newOutcomes.length === 0
            ? "All outcomes already exist as regions."
            : `Will add ${newOutcomes.length} region${newOutcomes.length !== 1 ? "s" : ""}.`}
        </p>
      )}
      <div className="flex gap-1.5">
        <button
          onClick={handleImport}
          disabled={!selectedTable || newOutcomes.length === 0 || importing}
          className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >{importing ? "Importing…" : "Import"}</button>
        <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
      </div>
    </div>
  );
}
