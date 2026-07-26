"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import type { GeneratedNpc, GenderSelection, NpcField, NpcProfile, NpcProfileConfig } from "@/types/npc";
import type { NpcResultSet } from "@/types/npcHistory";
import { useNpcProfiles, useCreateNpcProfile, useSaveNpcProfile, useDeleteNpcProfile } from "@/hooks/useNpcProfile";
import { useRandomTables } from "@/hooks/useRandomTables";
import { useCalendarConfig } from "@/hooks/useCalendar";
import { generateNpcBatch, rerollNpc, rerollNpcField } from "@/lib/npc/generator";
import { formatCampaignDate } from "@/lib/calendar/engine";
import { useNpcHistoryStore, selectSets } from "@/stores/npcHistoryStore";
import { NpcProfileEditor } from "./NpcProfileEditor";
import { NpcTableManager } from "./NpcTableManager";
import { TableImportWizard } from "@/components/tables/TableImportWizard";
import { SaveBatchDialog } from "./SaveBatchDialog";
import { NpcBrowser } from "./NpcBrowser";
import { NpcDetailPanel } from "./NpcDetailPanel";
import { NpcCreatorModal } from "./NpcCreatorModal";
import { NpcHistoryList } from "./NpcHistoryList";
import { useSaveSingleNpc, useSaveBatchNpcs, useNpcAffiliations } from "@/hooks/useSavedNpcs";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { BookmarkIcon, UploadIcon, AlignJustifyIcon, Settings2Icon, CopyIcon, PlusIcon } from "lucide-react";

interface Props {
  campaignId: string;
  currentRegionId: string | null;
  regions: { id: string; name: string }[];
  /** Campaign's current in-game date ("YYYY-MM-DD"), stamped onto each generated set. */
  currentDate: string;
}

const GENDER_OPTIONS: { value: GenderSelection; label: string }[] = [
  { value: "female", label: "F" },
  { value: "random", label: "?" },
  { value: "male",   label: "M" },
];

function isConfigured(config: NpcProfileConfig): boolean {
  return !!(
    config.typeTableId ||
    config.secondaryTypeTableId ||
    config.ageTableId ||
    config.physicalTableIds.length > 0 ||
    config.personalityTableIds.length > 0 ||
    config.detailTableIds.length > 0
  );
}

export function NpcPanel({ campaignId, currentRegionId, regions, currentDate }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const [saveBatchTarget, setSaveBatchTarget] = useState<NpcResultSet | null>(null);
  const [showBrowser, setShowBrowser] = useState(false);
  const [showCreator, setShowCreator] = useState(false);
  const [selectedSavedNpc, setSelectedSavedNpc] = useState<import("@/types/savedNpc").SavedNpcData | null>(null);
  const [genderSelection, setGenderSelection] = useState<GenderSelection>("random");
  const [count, setCount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { data: profiles, isLoading: profilesLoading } = useNpcProfiles(campaignId);
  const { data: tables, isLoading: tablesLoading } = useRandomTables(campaignId, "NPC");
  const { data: calendarConfig } = useCalendarConfig(campaignId);
  const { data: affiliations = [] } = useNpcAffiliations(campaignId);
  const createMutation = useCreateNpcProfile(campaignId);
  const saveMutation = useSaveNpcProfile(campaignId);
  const deleteMutation = useDeleteNpcProfile(campaignId);
  const saveSingleMutation = useSaveSingleNpc(campaignId);
  const saveBatchMutation = useSaveBatchNpcs(campaignId);

  const retention = useNpcHistoryStore((s) => s.retention);
  const setRetention = useNpcHistoryStore((s) => s.setRetention);
  const sets = useNpcHistoryStore(useMemo(() => selectSets(campaignId), [campaignId]));
  const pushSet = useNpcHistoryStore((s) => s.pushSet);
  const updateNpc = useNpcHistoryStore((s) => s.updateNpc);
  const markSaved = useNpcHistoryStore((s) => s.markSaved);
  const togglePin = useNpcHistoryStore((s) => s.togglePin);
  const dismissSet = useNpcHistoryStore((s) => s.dismissSet);
  const clearHistory = useNpcHistoryStore((s) => s.clear);

  // Keyed table lookup for re-roll (§9.6). Threaded down to the leaf card rather
  // than fetched there — `useRandomTables` only runs here.
  const tableMap = useMemo(() => new Map((tables ?? []).map((t) => [t.id, t])), [tables]);

  // Auto-select the first profile once loaded
  useEffect(() => {
    if (profiles && profiles.length > 0 && !selectedProfileId) {
      setSelectedProfileId(profiles[0].id);
    }
  }, [profiles]);

  const selectedProfile = profiles?.find((p) => p.id === selectedProfileId) ?? null;
  const hasConfig = selectedProfile ? isConfigured(selectedProfile.config) : false;
  const historyEmpty = sets.length === 0;

  function handleGenerate() {
    if (!selectedProfile || !tables) return;
    setError(null);

    const n = Math.max(1, Math.min(count, 100));
    const npcs = generateNpcBatch(n, selectedProfile, tableMap, currentRegionId, genderSelection);

    const regionName = regions.find((r) => r.id === currentRegionId)?.name ?? null;
    // Missing calendar config -> both the raw date and its label are omitted (D9).
    const inGameDate = calendarConfig ? currentDate : null;
    const inGameDateLabel = calendarConfig ? formatCampaignDate(currentDate, calendarConfig) : null;

    const resultSet: NpcResultSet = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      profileId: selectedProfile.id,
      profileName: selectedProfile.name,
      inGameDate,
      inGameDateLabel,
      regionId: currentRegionId,
      regionName,
      pinned: false,
      npcs,
    };

    pushSet(campaignId, resultSet);
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
  }

  async function handleSaveSingle(setId: string, index: number, npc: GeneratedNpc) {
    try {
      const created = await saveSingleMutation.mutateAsync(npc);
      markSaved(campaignId, setId, index, created.id);
      toast.success(`${npc.name ?? "NPC"} saved`);
    } catch {
      toast.error("Failed to save NPC");
    }
  }

  async function handleSaveBatch(selectedNpcs: GeneratedNpc[], affiliationName: string | undefined) {
    if (!saveBatchTarget) return;
    try {
      const created = await saveBatchMutation.mutateAsync({ npcs: selectedNpcs, affiliationName });
      // Mark each saved NPC by its index within the originating set. Batch
      // save preserves selection order (§10), so created[i] corresponds to
      // selectedNpcs[i]; we look up each npc's original slot in the set to
      // mark it there. This replaces object-identity matching against a flat
      // `npcs` array, which can't survive a re-roll swapping the object out.
      selectedNpcs.forEach((npc, i) => {
        const idx = saveBatchTarget.npcs.indexOf(npc);
        if (idx !== -1) markSaved(campaignId, saveBatchTarget.id, idx, created[i]?.id ?? null);
      });
      setSaveBatchTarget(null);
      toast.success(
        affiliationName
          ? `${selectedNpcs.length} NPC${selectedNpcs.length > 1 ? "s" : ""} saved to "${affiliationName}"`
          : `${selectedNpcs.length} NPC${selectedNpcs.length > 1 ? "s" : ""} saved`
      );
    } catch {
      toast.error("Failed to save NPCs");
    }
  }

  function handleRerollCard(setId: string, index: number, npc: GeneratedNpc) {
    const targetSet = sets.find((s) => s.id === setId);
    if (!targetSet) return;
    // Seed with the OTHER names in the same set so a re-roll doesn't collide
    // with its neighbors (§6.2's closing note).
    const usedNames = new Set(
      targetSet.npcs
        .filter((_, i) => i !== index)
        .map((n) => n.name)
        .filter((n): n is string => n !== null)
    );
    updateNpc(campaignId, setId, index, rerollNpc(npc, tableMap, usedNames));
  }

  function handleRerollField(setId: string, index: number, npc: GeneratedNpc, field: NpcField) {
    updateNpc(campaignId, setId, index, rerollNpcField(npc, field, tableMap));
  }

  async function handleCreateProfile() {
    const created = await createMutation.mutateAsync({ name: "New Profile" });
    setSelectedProfileId(created.id);
    setShowEditor(true);
  }

  async function handleDuplicateProfile() {
    if (!selectedProfile) return;
    const created = await createMutation.mutateAsync({
      name: `${selectedProfile.name} (Copy)`,
      config: selectedProfile.config,
    });
    setSelectedProfileId(created.id);
    setShowEditor(true);
  }

  async function handleDelete(profile: NpcProfile) {
    await deleteMutation.mutateAsync(profile.id);
    const remaining = (profiles ?? []).filter((p) => p.id !== profile.id);
    setSelectedProfileId(remaining[0]?.id ?? null);
    setShowEditor(false);
  }

  const isLoading = profilesLoading || tablesLoading;

  return (
    <div className="rounded-lg border border-border border-t-2 border-t-violet-400 dark:border-t-violet-500 flex flex-col gap-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          title={collapsed ? "Expand NPC Generator" : "Collapse NPC Generator"}
        >
          <svg
            className={["w-3 h-3 transition-transform text-violet-400 dark:text-violet-500", collapsed ? "-rotate-90" : ""].join(" ")}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          NPC Generator
        </button>
        {!collapsed && (
          <div className="flex items-center gap-1">
            <IconButton variant="ghost" size="icon-xs" onClick={() => setShowBrowser(true)} tooltip="Browse saved NPCs" aria-label="Browse saved NPCs">
              <BookmarkIcon />
            </IconButton>
            <IconButton variant="ghost" size="icon-xs" onClick={() => setShowImport(true)} tooltip="Import NPC table">
              <UploadIcon />
            </IconButton>
            <IconButton variant="ghost" size="icon-xs" onClick={() => setShowManager(true)} tooltip="Browse / edit NPC tables">
              <AlignJustifyIcon />
            </IconButton>
          </div>
        )}
      </div>

      {collapsed ? null : (
      <div className="px-3 py-3 flex flex-col gap-2">

      {/* Profile selector row */}
      <div className="flex items-center gap-1.5">
        <select
          value={selectedProfileId ?? ""}
          onChange={(e) => { setSelectedProfileId(e.target.value || null); setError(null); }}
          className="flex-1 min-w-0 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          disabled={!profiles || profiles.length === 0}
        >
          {(!profiles || profiles.length === 0) && <option value="">No profiles</option>}
          {profiles?.slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {selectedProfile && (
          <IconButton
            variant="ghost"
            size="icon-xs"
            onClick={() => setShowEditor(true)}
            tooltip="Configure profile"
          >
            <Settings2Icon />
          </IconButton>
        )}
        {selectedProfile && (
          <IconButton
            variant="ghost"
            size="icon-xs"
            onClick={handleDuplicateProfile}
            disabled={createMutation.isPending}
            tooltip="Duplicate profile"
          >
            <CopyIcon />
          </IconButton>
        )}
        <IconButton
          variant="ghost"
          size="icon-xs"
          onClick={handleCreateProfile}
          disabled={createMutation.isPending}
          tooltip="New profile"
        >
          <PlusIcon />
        </IconButton>
      </div>

      {/* Generate controls */}
      {selectedProfile && (
        <div className="flex items-center gap-1.5">
          <div data-slot="button-group" className="flex rounded border border-border overflow-hidden shrink-0" title="Gender selection">
            {GENDER_OPTIONS.map(({ value, label }) => (
              <Button
                key={value}
                size="xs"
                variant={genderSelection === value ? "default" : "ghost"}
                onClick={() => setGenderSelection(value)}
                title={value === "random" ? "Random gender" : value === "male" ? "Male" : "Female"}
              >
                {label}
              </Button>
            ))}
          </div>
          <Input
            type="number"
            min={1}
            max={100}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
            className="w-14 h-7 text-center font-mono text-xs shrink-0"
            title="Number of NPCs to generate"
          />
          <Button
            size="xs"
            onClick={handleGenerate}
            disabled={isLoading || !hasConfig}
            className="flex-1"
            title={!hasConfig ? "Configure this profile first" : "Generate NPCs"}
          >
            Generate
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={() => setShowCreator(true)}
            disabled={isLoading}
            title="Manually create and save an NPC"
            aria-label="Create NPC manually"
          >
            Create
          </Button>
        </div>
      )}

      {/* Error */}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* History / results */}
      {selectedProfile && !hasConfig && historyEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
          <p className="text-sm text-muted-foreground">No tables configured.</p>
          <Button variant="link" size="xs" onClick={() => setShowEditor(true)} className="mt-1">Configure this profile</Button>
        </div>
      ) : !selectedProfile && !profilesLoading && historyEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
          <p className="text-sm text-muted-foreground">No profiles yet.</p>
          <Button variant="link" size="xs" onClick={handleCreateProfile} className="mt-1">Create one</Button>
        </div>
      ) : (
        <NpcHistoryList
          sets={sets}
          retention={retention}
          tableMap={tableMap}
          onRetentionChange={setRetention}
          onClearAll={() => clearHistory(campaignId)}
          onTogglePin={(setId) => togglePin(campaignId, setId)}
          onDismiss={(setId) => dismissSet(campaignId, setId)}
          onSaveSingle={handleSaveSingle}
          onSaveBatch={(set) => setSaveBatchTarget(set)}
          onRerollCard={handleRerollCard}
          onRerollField={handleRerollField}
          isSavingSingle={saveSingleMutation.isPending}
          scrollContainerRef={scrollContainerRef}
        />
      )}

      {/* Modals */}
      {showCreator && selectedProfile && tables && (
        <NpcCreatorModal
          profile={selectedProfile}
          tables={tables}
          currentRegionId={currentRegionId}
          campaignId={campaignId}
          onClose={() => setShowCreator(false)}
          onSaved={() => setShowCreator(false)}
        />
      )}
      {showBrowser && (
        <NpcBrowser
          campaignId={campaignId}
          onSelectNpc={(npc) => { setSelectedSavedNpc(npc); }}
          onClose={() => setShowBrowser(false)}
        />
      )}
      {selectedSavedNpc && (
        <NpcDetailPanel
          npc={selectedSavedNpc}
          affiliations={affiliations}
          campaignId={campaignId}
          onClose={() => setSelectedSavedNpc(null)}
          onDeleted={() => { setSelectedSavedNpc(null); }}
        />
      )}
      {saveBatchTarget && saveBatchTarget.npcs.length > 1 && (
        <SaveBatchDialog
          npcs={saveBatchTarget.npcs}
          affiliations={affiliations}
          isSaving={saveBatchMutation.isPending}
          onSave={handleSaveBatch}
          onClose={() => setSaveBatchTarget(null)}
        />
      )}
      {showManager && tables && (
        <NpcTableManager tables={tables} campaignId={campaignId} regions={regions} onClose={() => setShowManager(false)} />
      )}
      {showImport && (
        <TableImportWizard campaignId={campaignId} category="NPC" regions={regions} seasons={[]} onClose={() => setShowImport(false)} />
      )}
      {showEditor && tables && selectedProfile && (
        <NpcProfileEditor
          profileName={selectedProfile.name}
          config={selectedProfile.config}
          tables={tables}
          onSave={async (config: NpcProfileConfig, name: string) => {
            await saveMutation.mutateAsync({ id: selectedProfile.id, config, name });
            setShowEditor(false);
          }}
          onClose={() => setShowEditor(false)}
          onDelete={() => handleDelete(selectedProfile)}
          isSaving={saveMutation.isPending}
          isDeleting={deleteMutation.isPending}
        />
      )}
      </div>
      )}
    </div>
  );
}
