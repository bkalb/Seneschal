"use client";

import { useState, useEffect } from "react";
import type { GeneratedNpc, GenderSelection, NpcProfile, NpcProfileConfig } from "@/types/npc";
import { useNpcProfiles, useCreateNpcProfile, useSaveNpcProfile, useDeleteNpcProfile } from "@/hooks/useNpcProfile";
import { useRandomTables } from "@/hooks/useRandomTables";
import { generateNpcBatch } from "@/lib/npc/generator";
import { NpcProfileEditor } from "./NpcProfileEditor";
import { NpcTableManager } from "./NpcTableManager";
import { TableImportWizard } from "@/components/tables/TableImportWizard";
import { SaveBatchDialog } from "./SaveBatchDialog";
import { NpcBrowser } from "./NpcBrowser";
import { NpcDetailPanel } from "./NpcDetailPanel";
import { NpcCreatorModal } from "./NpcCreatorModal";
import { useSaveSingleNpc, useSaveBatchNpcs, useNpcAffiliations } from "@/hooks/useSavedNpcs";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { BookmarkIcon, UploadIcon, AlignJustifyIcon, Settings2Icon, CopyIcon, PlusIcon } from "lucide-react";

interface Props {
  campaignId: string;
  currentRegionId: string | null;
  regions: { id: string; name: string }[];
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

function NpcCard({
  npc,
  showIndex,
  index,
  onSave,
  isSaved,
  isSaving,
}: {
  npc: GeneratedNpc;
  showIndex: boolean;
  index: number;
  onSave?: () => void;
  isSaved?: boolean;
  isSaving?: boolean;
}) {
  const isMale = npc.gender === "male";

  return (
    <div className="rounded-lg border border-border bg-card p-2.5 space-y-1">
      {/* Header: name (or index fallback) + gender + save */}
      <div className="flex items-baseline justify-between gap-1 pb-0.5 border-b border-border/60">
        <p className="text-xs font-semibold text-foreground leading-tight truncate">
          {npc.name ?? (showIndex ? `#${index + 1}` : "—")}
        </p>
        <div className="flex items-center gap-1 shrink-0">
          {onSave && (
            <Button
              variant="ghost"
              size="xs"
              onClick={onSave}
              disabled={isSaved || isSaving}
              title={isSaved ? "Saved" : "Save this NPC"}
              aria-label={isSaved ? "NPC saved" : "Save NPC"}
              className={cn(isSaved ? "text-green-600 dark:text-green-500 disabled:opacity-100" : "")}
            >
              {isSaved ? "✓ Saved" : "Save"}
            </Button>
          )}
          <span className={cn("text-sm font-bold", isMale ? "text-blue-600 dark:text-blue-400" : "text-pink-600 dark:text-pink-400")}>
            {isMale ? "♂" : "♀"}
          </span>
        </div>
      </div>

      {/* Type */}
      {npc.type !== null && (
        <div>
          <span className="text-[10px] font-semibold text-muted-foreground">{npc.typeLabel}: </span>
          <span className="text-xs text-foreground">{npc.type}</span>
        </div>
      )}

      {/* Secondary type */}
      {npc.secondaryType !== null && npc.secondaryTypeLabel && (
        <div>
          <span className="text-[10px] font-semibold text-muted-foreground">{npc.secondaryTypeLabel}: </span>
          <span className="text-xs text-foreground">{npc.secondaryType}</span>
        </div>
      )}

      {/* Age */}
      {npc.age !== null && (
        <div>
          <span className="text-[10px] font-semibold text-muted-foreground">Age: </span>
          <span className="text-xs text-foreground">{npc.age}</span>
        </div>
      )}

      {/* Physical traits */}
      {npc.physical.map((trait, i) => (
        <div key={`phys-${i}`}>
          <span className="text-[10px] font-semibold text-muted-foreground">Physical: </span>
          <span className="text-xs text-foreground">{trait}</span>
        </div>
      ))}

      {/* Personality traits */}
      {npc.personality.map((trait, i) => (
        <div key={`pers-${i}`}>
          <span className="text-[10px] font-semibold text-muted-foreground">Personality: </span>
          <span className="text-xs text-foreground">{trait}</span>
        </div>
      ))}

      {/* Detail rolls */}
      {npc.details.map((d, i) => (
        <div key={`det-${i}`}>
          <span className="text-[10px] font-semibold text-muted-foreground">{d.label}: </span>
          <span className="text-xs text-foreground">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

export function NpcPanel({ campaignId, currentRegionId, regions }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const [showSaveBatch, setShowSaveBatch] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [showCreator, setShowCreator] = useState(false);
  const [selectedSavedNpc, setSelectedSavedNpc] = useState<import("@/types/savedNpc").SavedNpcData | null>(null);
  const [genderSelection, setGenderSelection] = useState<GenderSelection>("random");
  const [count, setCount] = useState(1);
  const [npcs, setNpcs] = useState<GeneratedNpc[]>([]);
  const [savedIndices, setSavedIndices] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const { data: profiles, isLoading: profilesLoading } = useNpcProfiles(campaignId);
  const { data: tables, isLoading: tablesLoading } = useRandomTables(campaignId, "NPC");
  const { data: affiliations = [] } = useNpcAffiliations(campaignId);
  const createMutation = useCreateNpcProfile(campaignId);
  const saveMutation = useSaveNpcProfile(campaignId);
  const deleteMutation = useDeleteNpcProfile(campaignId);
  const saveSingleMutation = useSaveSingleNpc(campaignId);
  const saveBatchMutation = useSaveBatchNpcs(campaignId);

  // Auto-select the first profile once loaded
  useEffect(() => {
    if (profiles && profiles.length > 0 && !selectedProfileId) {
      setSelectedProfileId(profiles[0].id);
    }
  }, [profiles]);

  const selectedProfile = profiles?.find((p) => p.id === selectedProfileId) ?? null;
  const hasConfig = selectedProfile ? isConfigured(selectedProfile.config) : false;

  function handleGenerate() {
    if (!selectedProfile || !tables) return;
    setError(null);
    setSavedIndices(new Set());

    const tableMap = new Map(tables.map((t) => [t.id, t]));
    const n = Math.max(1, Math.min(count, 100));
    setNpcs(generateNpcBatch(n, selectedProfile, tableMap, currentRegionId, genderSelection));
  }

  async function handleSaveSingle(npc: GeneratedNpc, idx: number) {
    try {
      await saveSingleMutation.mutateAsync(npc);
      setSavedIndices((prev) => new Set(prev).add(idx));
      toast.success(`${npc.name ?? "NPC"} saved`);
    } catch {
      toast.error("Failed to save NPC");
    }
  }

  async function handleSaveBatch(selectedNpcs: GeneratedNpc[], affiliationName: string | undefined) {
    try {
      await saveBatchMutation.mutateAsync({ npcs: selectedNpcs, affiliationName });
      // Mark all saved NPCs by matching them back to their original indices
      const savedSet = new Set(selectedNpcs);
      setSavedIndices((prev) => {
        const next = new Set(prev);
        npcs.forEach((n, i) => { if (savedSet.has(n)) next.add(i); });
        return next;
      });
      setShowSaveBatch(false);
      toast.success(
        affiliationName
          ? `${selectedNpcs.length} NPC${selectedNpcs.length > 1 ? "s" : ""} saved to "${affiliationName}"`
          : `${selectedNpcs.length} NPC${selectedNpcs.length > 1 ? "s" : ""} saved`
      );
    } catch {
      toast.error("Failed to save NPCs");
    }
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
    setNpcs([]);
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
          onChange={(e) => { setSelectedProfileId(e.target.value || null); setNpcs([]); setError(null); }}
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

      {/* Results */}
      {npcs.length > 0 ? (
        <div className="flex flex-col gap-2 min-h-0">
          {/* Actions row above cards */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="xs" onClick={handleGenerate} className="text-muted-foreground">
              Re-roll
            </Button>
            {npcs.length > 1 && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setShowSaveBatch(true)}
                className="text-muted-foreground"
                aria-label="Save all NPCs as a group"
              >
                Save as Group…
              </Button>
            )}
          </div>
          <div className={[
            "overflow-y-auto max-h-96 pr-0.5",
            npcs.length > 1 ? "grid grid-cols-2 gap-2 content-start" : "space-y-2",
          ].join(" ")}>
            {npcs.map((npc, idx) => (
              <NpcCard
                key={idx}
                npc={npc}
                showIndex={npcs.length > 1}
                index={idx}
                onSave={() => handleSaveSingle(npc, idx)}
                isSaved={savedIndices.has(idx)}
                isSaving={saveSingleMutation.isPending}
              />
            ))}
          </div>
        </div>
      ) : selectedProfile && !hasConfig ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
          <p className="text-sm text-muted-foreground">No tables configured.</p>
          <Button variant="link" size="xs" onClick={() => setShowEditor(true)} className="mt-1">Configure this profile</Button>
        </div>
      ) : !selectedProfile && !profilesLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
          <p className="text-sm text-muted-foreground">No profiles yet.</p>
          <Button variant="link" size="xs" onClick={handleCreateProfile} className="mt-1">Create one</Button>
        </div>
      ) : null}

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
      {showSaveBatch && npcs.length > 1 && (
        <SaveBatchDialog
          npcs={npcs}
          affiliations={affiliations}
          isSaving={saveBatchMutation.isPending}
          onSave={handleSaveBatch}
          onClose={() => setShowSaveBatch(false)}
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
