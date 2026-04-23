"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import { useRandomTables } from "@/hooks/useRandomTables";
import type { EncounterWindow } from "@/lib/encounter-timing";
import { parseEncounterWindows } from "@/lib/encounter-timing";

interface Campaign {
  id: string;
  name: string;
  defaultSurpriseDice: string | null;
  defaultSurpriseThreshold: number | null;
  defaultReactionTableId: string | null;
  defaultMoraleTableId: string | null;
  encounterWindowsJson: string;
  defaultCombatAC: number | null;
  defaultCombatHD: string | null;
  defaultCombatAttackBonus: number | null;
  defaultCombatAttackDamage: string | null;
  defaultRollHpIndividually: boolean;
  defaultTraitTableId: string | null;
  defaultTraitCount: number | null;
}

interface Props {
  currentCampaign: Campaign;
  allCampaigns: { id: string; name: string }[];
}

export default function CampaignSwitcher({ currentCampaign, allCampaigns }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  // Settings state — initialised when dialog opens
  const [surpriseDice, setSurpriseDice] = useState("");
  const [surpriseThreshold, setSurpriseThreshold] = useState("");
  const [reactionTableId, setReactionTableId] = useState("");
  const [moraleTableId, setMoraleTableId] = useState("");
  const [encounterWindows, setEncounterWindows] = useState<EncounterWindow[]>([]);
  const [combatAC, setCombatAC] = useState("");
  const [combatHD, setCombatHD] = useState("");
  const [combatAttackBonus, setCombatAttackBonus] = useState("");
  const [combatAttackDamage, setCombatAttackDamage] = useState("");
  const [rollHpIndividually, setRollHpIndividually] = useState(false);
  const [traitTableId, setTraitTableId] = useState("");
  const [traitCount, setTraitCount] = useState("");

  const { data: reactionTables = [] } = useRandomTables(currentCampaign.id, "REACTION");
  const { data: moraleTables = [] } = useRandomTables(currentCampaign.id, "MORALE");
  const { data: npcTables = [] } = useRandomTables(currentCampaign.id, "NPC");
  const sortedNpcTables = npcTables.slice().sort((a, b) => a.name.localeCompare(b.name));

  function openSettings() {
    setSurpriseDice(currentCampaign.defaultSurpriseDice ?? "");
    setSurpriseThreshold(currentCampaign.defaultSurpriseThreshold?.toString() ?? "");
    setReactionTableId(currentCampaign.defaultReactionTableId ?? "");
    setMoraleTableId(currentCampaign.defaultMoraleTableId ?? "");
    setEncounterWindows(parseEncounterWindows(currentCampaign.encounterWindowsJson));
    setCombatAC(currentCampaign.defaultCombatAC?.toString() ?? "");
    setCombatHD(currentCampaign.defaultCombatHD ?? "");
    setCombatAttackBonus(currentCampaign.defaultCombatAttackBonus?.toString() ?? "");
    setCombatAttackDamage(currentCampaign.defaultCombatAttackDamage ?? "");
    setRollHpIndividually(currentCampaign.defaultRollHpIndividually);
    setTraitTableId(currentCampaign.defaultTraitTableId ?? "");
    setTraitCount(currentCampaign.defaultTraitCount?.toString() ?? "");
    setSettingsOpen(true);
  }

  function addWindow() {
    setEncounterWindows((prev) => [
      ...prev,
      { name: "", startHour: 6, startMinute: 0, endHour: 18, endMinute: 0 },
    ]);
  }

  function updateWindow(idx: number, patch: Partial<EncounterWindow>) {
    setEncounterWindows((prev) => prev.map((w, i) => i === idx ? { ...w, ...patch } : w));
  }

  function removeWindow(idx: number) {
    setEncounterWindows((prev) => prev.filter((_, i) => i !== idx));
  }

  /** Format hours/minutes as HH:MM for <input type="time"> */
  function toTimeInput(h: number, m: number) {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  }

  /** Parse HH:MM back to { hour, minute } */
  function fromTimeInput(value: string) {
    const [h, m] = value.split(":").map(Number);
    return { hour: h ?? 0, minute: m ?? 0 };
  }

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to create campaign");
      return res.json();
    },
    onSuccess: (newCampaign) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      setCreateOpen(false);
      router.push(`/dashboard/${newCampaign.id}`);
      toast.success("Campaign created");
    },
    onError: () => toast.error("Failed to create campaign"),
  });

  const renameMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`/api/campaigns/${currentCampaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to rename");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      setRenameOpen(false);
      router.refresh();
      toast.success("Campaign renamed");
    },
    onError: () => toast.error("Failed to rename campaign"),
  });

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/campaigns/${currentCampaign.id}/duplicate`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to duplicate");
      return res.json();
    },
    onSuccess: (newCampaign) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      router.push(`/dashboard/${newCampaign.id}`);
      toast.success("Campaign duplicated");
    },
    onError: () => toast.error("Failed to duplicate campaign"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/campaigns/${currentCampaign.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      setDeleteOpen(false);
      const next = allCampaigns.find((c) => c.id !== currentCampaign.id);
      router.push(next ? `/dashboard/${next.id}` : "/dashboard");
      toast.success("Campaign deleted");
    },
    onError: () => toast.error("Failed to delete campaign"),
  });

  const settingsMutation = useMutation({
    mutationFn: async () => {
      const threshold = surpriseThreshold.trim() ? parseInt(surpriseThreshold.trim(), 10) : null;
      const res = await fetch(`/api/campaigns/${currentCampaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultSurpriseDice: surpriseDice.trim() || null,
          defaultSurpriseThreshold: threshold,
          defaultReactionTableId: reactionTableId || null,
          defaultMoraleTableId: moraleTableId || null,
          encounterWindows,
          defaultCombatAC: combatAC.trim() ? parseInt(combatAC.trim(), 10) : null,
          defaultCombatHD: combatHD.trim() || null,
          defaultCombatAttackBonus: combatAttackBonus.trim() ? parseInt(combatAttackBonus.trim(), 10) : null,
          defaultCombatAttackDamage: combatAttackDamage.trim() || null,
          defaultRollHpIndividually: rollHpIndividually,
          defaultTraitTableId: traitTableId || null,
          defaultTraitCount: traitCount.trim() ? parseInt(traitCount.trim(), 10) : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      return res.json();
    },
    onSuccess: () => {
      setSettingsOpen(false);
      router.refresh();
      toast.success("Campaign settings saved");
    },
    onError: () => toast.error("Failed to save settings"),
  });

  async function handleExport() {
    const res = await fetch(`/api/campaigns/${currentCampaign.id}/export`);
    if (!res.ok) { toast.error("Export failed"); return; }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const filenameMatch = disposition.match(/filename="([^"]+)"/);
    const filename = filenameMatch?.[1] ?? "campaign_export.json";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch("/api/campaigns/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(`Import failed: ${err.error ?? res.statusText}`);
        return;
      }
      const newCampaign = await res.json();
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success(`"${newCampaign.name}" imported`);
      router.push(`/dashboard/${newCampaign.id}`);
    } catch (err) {
      toast.error("Import failed: invalid file");
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      {/* Hidden file input for import */}
      <input
        ref={importFileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportFile}
      />
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1 max-w-xs rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors">
          <span className="truncate">{currentCampaign.name}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {allCampaigns.length > 1 && (
            <>
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                Switch campaign
              </DropdownMenuLabel>
              {allCampaigns
                .filter((c) => c.id !== currentCampaign.id)
                .map((c) => (
                  <DropdownMenuItem key={c.id} onClick={() => router.push(`/dashboard/${c.id}`)}>
                    {c.name}
                  </DropdownMenuItem>
                ))}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            onClick={() => {
              setNameValue("");
              setCreateOpen(true);
            }}
          >
            New campaign…
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setNameValue(currentCampaign.name);
              setRenameOpen(true);
            }}
          >
            Rename…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => duplicateMutation.mutate()} disabled={duplicateMutation.isPending}>
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExport}>
            Export…
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => importFileRef.current?.click()}
            disabled={importing}
          >
            {importing ? "Importing…" : "Import…"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openSettings}>
            Settings…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => setDeleteOpen(true)}
            disabled={allCampaigns.length <= 1}
          >
            Delete campaign
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut().then(() => router.push("/login"))}>
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-name">Campaign name</Label>
            <Input
              id="new-name"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && nameValue.trim() && createMutation.mutate(nameValue.trim())}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(nameValue.trim())}
              disabled={!nameValue.trim() || createMutation.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-name">Campaign name</Label>
            <Input
              id="rename-name"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && nameValue.trim() && renameMutation.mutate(nameValue.trim())}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button
              onClick={() => renameMutation.mutate(nameValue.trim())}
              disabled={!nameValue.trim() || renameMutation.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Campaign Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Surprise defaults */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Default surprise roll
              </p>
              <p className="text-xs text-muted-foreground leading-snug">
                Applied to all encounter tables that don't have their own surprise configuration.
              </p>
              <div className="flex items-center gap-3">
                <div className="space-y-1 flex-1">
                  <Label htmlFor="surprise-dice" className="text-xs">Dice</Label>
                  <Input
                    id="surprise-dice"
                    placeholder="e.g. 1d6"
                    value={surpriseDice}
                    onChange={(e) => setSurpriseDice(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1 w-24">
                  <Label htmlFor="surprise-threshold" className="text-xs">Threshold ≤</Label>
                  <Input
                    id="surprise-threshold"
                    type="number"
                    min={0}
                    placeholder="e.g. 2"
                    value={surpriseThreshold}
                    onChange={(e) => setSurpriseThreshold(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              {surpriseDice.trim() && !surpriseThreshold.trim() && (
                <p className="text-xs text-amber-600">Set a threshold to enable surprise rolls.</p>
              )}
            </div>

            {/* Reaction table */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Default reaction table
              </p>
              <p className="text-xs text-muted-foreground leading-snug">
                Rolled automatically with every encounter. If unset, the first imported reaction table is used.
              </p>
              {reactionTables.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No reaction tables imported yet.
                </p>
              ) : (
                <select
                  value={reactionTableId}
                  onChange={(e) => setReactionTableId(e.target.value)}
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">First imported (automatic)</option>
                  {reactionTables
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                </select>
              )}
            </div>

            {/* Morale table */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Default morale table
              </p>
              <p className="text-xs text-muted-foreground leading-snug">
                Displayed prominently in the main UI below the reaction table.
              </p>
              {moraleTables.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No morale tables imported yet.
                </p>
              ) : (
                <select
                  value={moraleTableId}
                  onChange={(e) => setMoraleTableId(e.target.value)}
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">None</option>
                  {moraleTables
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                </select>
              )}
            </div>

            {/* Combat defaults */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Combat defaults
              </p>
              <p className="text-xs text-muted-foreground leading-snug">
                Pre-fill stat fields when adding new combatants in Combat mode.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="combat-ac" className="text-xs">AC</Label>
                  <Input
                    id="combat-ac"
                    type="number"
                    placeholder="e.g. 9"
                    value={combatAC}
                    onChange={(e) => setCombatAC(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="combat-hd" className="text-xs">HD</Label>
                  <Input
                    id="combat-hd"
                    placeholder="e.g. 1d8"
                    value={combatHD}
                    onChange={(e) => setCombatHD(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="combat-atk-bonus" className="text-xs">Attack Bonus</Label>
                  <Input
                    id="combat-atk-bonus"
                    type="number"
                    placeholder="e.g. 0"
                    value={combatAttackBonus}
                    onChange={(e) => setCombatAttackBonus(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="combat-atk-dmg" className="text-xs">Attack Damage</Label>
                  <Input
                    id="combat-atk-dmg"
                    placeholder="e.g. 1d6"
                    value={combatAttackDamage}
                    onChange={(e) => setCombatAttackDamage(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={rollHpIndividually}
                  onChange={(e) => setRollHpIndividually(e.target.checked)}
                  className="rounded"
                />
                <span className="text-xs text-muted-foreground">Roll HP individually by default</span>
              </label>
              <div className="space-y-1 pt-1">
                <Label className="text-xs">Default humanoid traits table</Label>
                {sortedNpcTables.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No NPC tables imported yet.</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={traitTableId}
                      onChange={(e) => setTraitTableId(e.target.value)}
                      className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">None (auto-select first)</option>
                      {sortedNpcTables.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      placeholder="2"
                      value={traitCount}
                      onChange={(e) => setTraitCount(e.target.value)}
                      className="w-14 h-8 text-xs text-center"
                      title="Default number of traits per combatant"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Encounter time windows */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Encounter time windows
              </p>
              <p className="text-xs text-muted-foreground leading-snug">
                Named windows used when rolling encounter timing. Leave empty to skip automatic timing.
              </p>
              {encounterWindows.length > 0 && (
                <div className="space-y-2">
                  {encounterWindows.map((w, i) => (
                    <div key={i} className="rounded border border-border bg-muted/20 p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Window name (e.g. Day)"
                          value={w.name}
                          onChange={(e) => updateWindow(i, { name: e.target.value })}
                          className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button
                          onClick={() => removeWindow(i)}
                          className="text-muted-foreground hover:text-destructive shrink-0"
                          title="Remove window"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="shrink-0">From</span>
                        <input
                          type="time"
                          value={toTimeInput(w.startHour, w.startMinute)}
                          onChange={(e) => {
                            const { hour, minute } = fromTimeInput(e.target.value);
                            updateWindow(i, { startHour: hour, startMinute: minute });
                          }}
                          className="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <span className="shrink-0">to</span>
                        <input
                          type="time"
                          value={toTimeInput(w.endHour, w.endMinute)}
                          onChange={(e) => {
                            const { hour, minute } = fromTimeInput(e.target.value);
                            updateWindow(i, { endHour: hour, endMinute: minute });
                          }}
                          className="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={addWindow}
                className="w-full rounded border border-dashed border-border py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
              >
                + Add window
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
            <Button
              onClick={() => settingsMutation.mutate()}
              disabled={settingsMutation.isPending}
            >
              {settingsMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{currentCampaign.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the campaign and all its data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
