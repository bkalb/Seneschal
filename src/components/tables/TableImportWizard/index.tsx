"use client";

import { useState } from "react";
import type { ParsedTablePreview, TableCategory } from "@/types/table";
import { useImportTablePreview, useCreateTable } from "@/hooks/useRandomTables";
import { isValidDiceExpression } from "@/lib/dice/roller";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Step = 1 | 2 | 3;

interface Props {
  campaignId: string;
  category: TableCategory;
  regions: { id: string; name: string }[];
  seasons: string[];
  onClose: () => void;
  /** Campaign-level surprise defaults — pre-populate when importing ENCOUNTER tables */
  defaultSurpriseDice?: string | null;
  defaultSurpriseThreshold?: number | null;
}

export function TableImportWizard({ campaignId, category, regions, seasons, onClose, defaultSurpriseDice, defaultSurpriseThreshold }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [rawText, setRawText] = useState("");
  const [detectedFormat, setDetectedFormat] = useState<string>("");
  const [preview, setPreview] = useState<ParsedTablePreview | null>(null);

  // Step 3 config
  const [tableName, setTableName] = useState("");
  const [diceExpression, setDiceExpression] = useState("");
  const [isStateful, setIsStateful] = useState(false);
  const [rollOnDayAdvance, setRollOnDayAdvance] = useState(false);
  const [selectedSeasons, setSelectedSeasons] = useState<string[]>([]);
  const [selectedRegionIds, setSelectedRegionIds] = useState<string[]>([]);
  // Surprise roll config (ENCOUNTER only) — pre-populated from campaign defaults
  const [surpriseDice, setSurpriseDice] = useState(category === "ENCOUNTER" ? (defaultSurpriseDice ?? "") : "");
  const [surpriseThreshold, setSurpriseThreshold] = useState(
    category === "ENCOUNTER" ? (defaultSurpriseThreshold?.toString() ?? "") : ""
  );

  const previewMutation = useImportTablePreview();
  const createMutation = useCreateTable(campaignId);

  async function handleParse() {
    if (!rawText.trim()) return;
    const result = await previewMutation.mutateAsync({ raw: rawText });
    setPreview(result);
    setDetectedFormat(result.format);
    setDiceExpression(result.detectedDiceExpression);
    setStep(2);
  }

  function handleConfigureNext() {
    setStep(3);
  }

  async function handleCreate() {
    if (!preview || !tableName.trim()) return;
    if (!isValidDiceExpression(diceExpression)) return;

    const threshold = surpriseThreshold.trim() ? parseInt(surpriseThreshold.trim(), 10) : null;
    // Note: POST /api/random-tables (createSchema) has no `seasonName` field — season
    // selection here was already a no-op server-side prior to this cleanup. Season
    // filtering can be configured afterward via TableEditModal, which does support it.
    await createMutation.mutateAsync({
      name: tableName.trim(),
      category,
      diceExpression,
      isStateful,
      rollOnDayAdvance,
      rows: preview.rows,
      modifiers: [],
      regionIds: selectedRegionIds,
      surpriseDice: surpriseDice.trim() || null,
      surpriseThreshold: threshold,
    });

    onClose();
  }

  function toggleRegion(id: string) {
    setSelectedRegionIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  }

  function toggleSeason(name: string) {
    setSelectedSeasons((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]
    );
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg flex flex-col max-h-[90vh]">
        <DialogHeader className="pb-3 border-b border-border">
          <DialogTitle>Import Table</DialogTitle>
          <p className="text-xs text-muted-foreground">Step {step} of 3</p>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto py-2 space-y-3 min-h-0">
          {step === 1 && (
            <>
              <p className="text-sm text-muted-foreground">
                Paste your table as CSV, markdown, or plain text. The format will be detected automatically.
              </p>
              <textarea
                className="w-full h-52 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder={"| Roll | Result |\n|------|--------|\n| 1-2  | Wolves |\n| 3-4  | Bandits |"}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
              />
              {previewMutation.isError && (
                <p className="text-xs text-destructive">Parse error — check your input format.</p>
              )}
            </>
          )}

          {step === 2 && preview && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{preview.rows.length} rows detected</p>
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                  {detectedFormat}
                </span>
              </div>

              {preview.warnings.length > 0 && (
                <div className="rounded-md bg-yellow-50 border border-yellow-200 p-2 space-y-0.5">
                  {preview.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-yellow-800">{w}</p>
                  ))}
                </div>
              )}

              <div className="border border-border rounded-md overflow-hidden">
                <div className="grid grid-cols-[60px_1fr] text-xs font-medium bg-muted px-3 py-1.5 text-muted-foreground">
                  <span>Range</span>
                  <span>Outcome</span>
                </div>
                <div className="divide-y divide-border max-h-48 overflow-y-auto">
                  {preview.rows.map((row, i) => (
                    <div key={i} className="grid grid-cols-[60px_1fr] px-3 py-1.5 text-xs">
                      <span className="text-muted-foreground font-mono">
                        {row.min === row.max ? row.min : `${row.min}–${row.max}`}
                      </span>
                      <span>{row.outcome}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 3 && preview && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="import-table-name" className="text-xs text-muted-foreground">Table name</Label>
                <Input
                  id="import-table-name"
                  type="text"
                  placeholder="e.g. Random Weather"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="import-dice-expr" className="text-xs text-muted-foreground">Dice expression</Label>
                <Input
                  id="import-dice-expr"
                  type="text"
                  className="font-mono"
                  value={diceExpression}
                  onChange={(e) => setDiceExpression(e.target.value)}
                />
                {diceExpression && !isValidDiceExpression(diceExpression) && (
                  <p className="text-xs text-destructive">Must be like "1d8" or "2d6"</p>
                )}
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isStateful}
                    onChange={(e) => setIsStateful(e.target.checked)}
                    className="rounded"
                  />
                  Stateful (remembers last result)
                </label>
              </div>

              {category === "CALENDAR" && (
                <>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rollOnDayAdvance}
                        onChange={(e) => setRollOnDayAdvance(e.target.checked)}
                        className="rounded"
                      />
                      Auto-roll on day advance
                    </label>
                  </div>

                  {rollOnDayAdvance && seasons.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">
                        Seasons <span className="font-normal">(blank = roll every season)</span>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {seasons.map((s) => (
                          <button
                            key={s}
                            onClick={() => toggleSeason(s)}
                            className={[
                              "px-2.5 py-1 rounded-full text-xs border transition-colors",
                              selectedSeasons.includes(s)
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-border text-muted-foreground hover:border-primary",
                            ].join(" ")}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {category === "ENCOUNTER" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground block">
                    Surprise roll
                    <span className="ml-1.5 font-normal text-muted-foreground/70">— leave blank to use campaign default or skip</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 space-y-1">
                      <Label htmlFor="import-surprise-dice" className="text-xs text-muted-foreground">Dice</Label>
                      <Input
                        id="import-surprise-dice"
                        type="text"
                        placeholder="e.g. 1d6"
                        value={surpriseDice}
                        onChange={(e) => setSurpriseDice(e.target.value)}
                      />
                    </div>
                    <div className="w-24 space-y-1">
                      <Label htmlFor="import-surprise-threshold" className="text-xs text-muted-foreground">Threshold ≤</Label>
                      <Input
                        id="import-surprise-threshold"
                        type="number"
                        min={0}
                        placeholder="e.g. 2"
                        value={surpriseThreshold}
                        onChange={(e) => setSurpriseThreshold(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {regions.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Regions (optional)
                    {category === "CALENDAR" && (
                      <span className="ml-1.5 font-normal text-muted-foreground/70">— blank = all regions</span>
                    )}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {regions.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => toggleRegion(r.id)}
                        className={[
                          "px-2.5 py-1 rounded-full text-xs border transition-colors",
                          selectedRegionIds.includes(r.id)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground hover:border-primary",
                        ].join(" ")}
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {createMutation.isError && (
                <p className="text-xs text-destructive">
                  {(createMutation.error as Error)?.message || "Failed to create table"}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => step > 1 ? setStep((step - 1) as Step) : onClose()}
          >
            {step === 1 ? "Cancel" : "Back"}
          </Button>

          <div>
            {step === 1 && (
              <Button
                size="sm"
                onClick={handleParse}
                disabled={!rawText.trim() || previewMutation.isPending}
              >
                {previewMutation.isPending ? "Parsing…" : "Parse →"}
              </Button>
            )}
            {step === 2 && (
              <Button
                size="sm"
                onClick={handleConfigureNext}
                disabled={!preview || preview.rows.length === 0}
              >
                Configure →
              </Button>
            )}
            {step === 3 && (
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={!tableName.trim() || !isValidDiceExpression(diceExpression) || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating…" : "Create Table"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
