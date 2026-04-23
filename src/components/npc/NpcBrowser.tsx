"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSavedNpcs, useNpcAffiliations, useUpdateSavedNpc } from "@/hooks/useSavedNpcs";
import type { SavedNpcData } from "@/types/savedNpc";
import type { SavedNpcFilters } from "@/hooks/useSavedNpcs";

interface Props {
  campaignId: string;
  onSelectNpc: (npc: SavedNpcData) => void;
  onClose: () => void;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "alive", label: "Alive" },
  { value: "deceased", label: "Deceased" },
] as const;

const SORT_OPTIONS = [
  { value: "createdAt", label: "Date Saved" },
  { value: "name", label: "Name" },
  { value: "type", label: "Type" },
] as const;

const ROW_HEIGHT = 56; // px, fixed for virtualizer

export function NpcBrowser({ campaignId, onSelectNpc, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [affiliationFilter, setAffiliationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "alive" | "deceased">("all");
  const [sortBy, setSortBy] = useState<SavedNpcFilters["sortBy"]>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const parentRef = useRef<HTMLDivElement>(null);

  // Debounce search input (250 ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const filters: SavedNpcFilters = {
    search: debouncedSearch || undefined,
    affiliationId: affiliationFilter || undefined,
    status: statusFilter,
    sortBy,
    sortDir,
  };

  const { data: npcs = [], isLoading } = useSavedNpcs(campaignId, filters);
  const { data: affiliations = [] } = useNpcAffiliations(campaignId);
  const updateMutation = useUpdateSavedNpc(campaignId);

  const virtualizer = useVirtualizer({
    count: npcs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  const handlePinToggle = useCallback(
    (e: React.MouseEvent, npc: SavedNpcData) => {
      e.stopPropagation();
      updateMutation.mutate({ id: npc.id, patch: { isPinned: !npc.isPinned } });
    },
    [updateMutation]
  );

  const pinnedCount = npcs.filter((n) => n.isPinned).length;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Saved NPCs browser"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative flex flex-col w-full max-w-lg h-full bg-background border-l border-border shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div>
            <h2 className="font-semibold text-sm">Saved NPCs</h2>
            {!isLoading && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {npcs.length} result{npcs.length !== 1 ? "s" : ""}
                {pinnedCount > 0 && ` · ${pinnedCount} pinned`}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close saved NPCs browser"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-border shrink-0">
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or type…"
              className="w-full pl-8 pr-3 py-1.5 rounded border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label="Search saved NPCs"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Filters + Sort */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border shrink-0">
          {/* Affiliation filter */}
          <select
            value={affiliationFilter}
            onChange={(e) => setAffiliationFilter(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label="Filter by affiliation"
          >
            <option value="">All affiliations</option>
            {affiliations.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "alive" | "deceased")}
            className="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label="Filter by status"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SavedNpcFilters["sortBy"])}
            className="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label="Sort by"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* Sort direction */}
          <button
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label={sortDir === "asc" ? "Sorted ascending, click to sort descending" : "Sorted descending, click to sort ascending"}
            title={sortDir === "asc" ? "Ascending" : "Descending"}
          >
            {sortDir === "asc" ? (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
              </svg>
            )}
          </button>
        </div>

        {/* List */}
        <div ref={parentRef} className="flex-1 overflow-y-auto" aria-label="NPC list">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
              Loading…
            </div>
          ) : npcs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-1 text-center px-4">
              <p className="text-xs text-muted-foreground">
                {debouncedSearch || affiliationFilter || statusFilter !== "all"
                  ? "No NPCs match your filters."
                  : "No saved NPCs yet. Generate and save some from the NPC Generator."}
              </p>
            </div>
          ) : (
            <div
              style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
              aria-label="Virtualized NPC rows"
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const npc = npcs[virtualRow.index];
                return (
                  <div
                    key={npc.id}
                    data-index={virtualRow.index}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${ROW_HEIGHT}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <NpcRow
                      npc={npc}
                      affiliations={affiliations}
                      onSelect={() => onSelectNpc(npc)}
                      onPinToggle={(e) => handlePinToggle(e, npc)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NpcRow({
  npc,
  affiliations,
  onSelect,
  onPinToggle,
}: {
  npc: SavedNpcData;
  affiliations: { id: string; name: string }[];
  onSelect: () => void;
  onPinToggle: (e: React.MouseEvent) => void;
}) {
  const affName = affiliations.find((a) => a.id === npc.affiliationId)?.name;
  const isMale = npc.gender === "male";

  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-4 border-b border-border/60 hover:bg-muted/50 transition-colors text-left"
      style={{ height: ROW_HEIGHT }}
      aria-label={`Open ${npc.name ?? "unnamed NPC"}`}
    >
      {/* Pin button */}
      <button
        onClick={onPinToggle}
        className={[
          "shrink-0 p-1 rounded transition-colors",
          npc.isPinned
            ? "text-amber-500 hover:text-amber-400"
            : "text-muted-foreground/40 hover:text-muted-foreground",
        ].join(" ")}
        aria-label={npc.isPinned ? "Unpin NPC" : "Pin NPC"}
        title={npc.isPinned ? "Unpin" : "Pin to top"}
      >
        <svg className="w-3.5 h-3.5" fill={npc.isPinned ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
      </button>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-foreground truncate">
            {npc.name ?? <em className="text-muted-foreground">Unnamed</em>}
          </span>
          <span className={["text-xs font-bold shrink-0", isMale ? "text-blue-400" : "text-pink-400"].join(" ")}>
            {isMale ? "♂" : "♀"}
          </span>
          {npc.isDeceased && (
            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded bg-muted text-muted-foreground">
              Deceased
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {npc.type && (
            <span className="text-[10px] text-muted-foreground truncate">{npc.type}</span>
          )}
          {affName && (
            <>
              {npc.type && <span className="text-[10px] text-muted-foreground/50">·</span>}
              <span className="text-[10px] text-muted-foreground/80 truncate italic">{affName}</span>
            </>
          )}
        </div>
      </div>

      {/* Chevron */}
      <svg className="w-3 h-3 text-muted-foreground/40 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
