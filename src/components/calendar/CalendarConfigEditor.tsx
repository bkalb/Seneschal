"use client";

import { useState } from "react";
import type { CalendarConfig, CalendarMonth, CalendarSeason, IntercalaryPeriod, Moon } from "@/types/calendar";
import { useSaveCalendarConfig } from "@/hooks/useCalendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { XIcon, PlusIcon, UploadIcon } from "lucide-react";

interface Props {
  campaignId: string;
  existing: CalendarConfig | null;
  onClose: () => void;
}

const DEFAULT_CONFIG: Omit<CalendarConfig, "id" | "campaignId"> = {
  epochDate: "0001-01-01",
  months: [
    { name: "January", days: 31 }, { name: "February", days: 28 },
    { name: "March", days: 31 }, { name: "April", days: 30 },
    { name: "May", days: 31 }, { name: "June", days: 30 },
    { name: "July", days: 31 }, { name: "August", days: 31 },
    { name: "September", days: 30 }, { name: "October", days: 31 },
    { name: "November", days: 30 }, { name: "December", days: 31 },
  ],
  weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  seasons: [],
  intercalary: [],
  moons: [],
};

// ─── Astronomical helpers ─────────────────────────────────────────────────────

/**
 * Convert a proleptic Gregorian date to Julian Day Number (integer part only).
 */
function gregorianToJD(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/**
 * Convert a Julian Day Number to a proleptic Gregorian date string "YYYY-MM-DD".
 */
function jdToGregorian(jd: number): string {
  const z = Math.floor(jd + 0.5);
  const a = Math.floor((z - 1867216.25) / 36524.25);
  const aa = z + 1 + a - Math.floor(a / 4);
  const b = aa + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);
  const day = b - d - Math.floor(30.6001 * e);
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Find the calendar date of the new moon closest to January 1 of the given year.
 * Uses the J2000 reference new moon (JD 2451550.09766 = Jan 6.598, 2000 UTC)
 * and the mean synodic month (29.530588853 days).
 */
function referenceNewMoonForYear(year: number): string {
  const REF_JD = 2451550.09766; // Jan 6.598, 2000 UTC — known new moon
  const SYNODIC = 29.530588853;
  const jan1JD = gregorianToJD(year, 1, 1);
  // Nearest integer number of lunations from reference to Jan 1
  const k = Math.round((jan1JD - REF_JD) / SYNODIC);
  const newMoonJD = REF_JD + k * SYNODIC;
  return jdToGregorian(newMoonJD);
}

// ─── Preset builder ───────────────────────────────────────────────────────────

function buildGregorianPreset(year: number) {
  return {
    epochDate: `${String(year).padStart(4, "0")}-01-01`,
    months: DEFAULT_CONFIG.months,
    weekdays: DEFAULT_CONFIG.weekdays,
    seasons: [] as CalendarSeason[],
    intercalary: [] as IntercalaryPeriod[],
    moons: [
      {
        id: crypto.randomUUID(),
        name: "Moon",
        cycleLength: 29,
        referenceNewMoon: referenceNewMoonForYear(year),
      },
    ] as Moon[],
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CalendarConfigEditor({ campaignId, existing, onClose }: Props) {
  const init = existing ?? DEFAULT_CONFIG;

  const [epochDate, setEpochDate] = useState(init.epochDate);
  const [months, setMonths] = useState<CalendarMonth[]>(init.months);
  const [weekdays, setWeekdays] = useState<string[]>(init.weekdays);
  const [weekdayInput, setWeekdayInput] = useState(init.weekdays.join(", "));
  const [seasons, setSeasons] = useState<CalendarSeason[]>(init.seasons);
  const [intercalary, setIntercalary] = useState<IntercalaryPeriod[]>(init.intercalary);
  const [moons, setMoons] = useState<Moon[]>(init.moons.map((m) => ({ ...m, id: m.id ?? crypto.randomUUID() })));
  const [tab, setTab] = useState<"months" | "weekdays" | "seasons" | "intercalary" | "moons">("months");

  // Preset panel state
  const [showPreset, setShowPreset] = useState(false);
  const [presetYear, setPresetYear] = useState("");
  const [presetPreview, setPresetPreview] = useState<{ referenceNewMoon: string } | null>(null);

  const saveMutation = useSaveCalendarConfig(campaignId);

  function updateMonth(i: number, patch: Partial<CalendarMonth>) {
    setMonths((prev) => prev.map((m, idx) => idx === i ? { ...m, ...patch } : m));
  }
  function addMonth() { setMonths((p) => [...p, { name: "", days: 30 }]); }
  function removeMonth(i: number) { setMonths((p) => p.filter((_, idx) => idx !== i)); }

  function updateWeekdays() {
    setWeekdays(weekdayInput.split(",").map((s) => s.trim()).filter(Boolean));
  }

  function updateSeason(i: number, patch: Partial<CalendarSeason>) {
    setSeasons((p) => p.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }
  function addSeason() { setSeasons((p) => [...p, { name: "", startMonth: 1, startDay: 1, endMonth: 3, endDay: 30 }]); }
  function removeSeason(i: number) { setSeasons((p) => p.filter((_, idx) => idx !== i)); }

  function updateIC(i: number, patch: Partial<IntercalaryPeriod>) {
    setIntercalary((p) => p.map((ic, idx) => idx === i ? { ...ic, ...patch } : ic));
  }
  function addIC() { setIntercalary((p) => [...p, { name: "", afterMonth: 1, days: 1, outsideWeeks: false }]); }
  function removeIC(i: number) { setIntercalary((p) => p.filter((_, idx) => idx !== i)); }

  function updateMoon(i: number, patch: Partial<Moon>) {
    setMoons((p) => p.map((m, idx) => idx === i ? { ...m, ...patch } : m));
  }
  function addMoon() { setMoons((p) => [...p, { id: crypto.randomUUID(), name: "", cycleLength: 28, referenceNewMoon: epochDate }]); }
  function removeMoon(i: number) { setMoons((p) => p.filter((_, idx) => idx !== i)); }

  function handlePresetYearChange(val: string) {
    setPresetYear(val);
    const y = parseInt(val, 10);
    if (!isNaN(y) && y > 0 && val.length >= 3) {
      setPresetPreview({ referenceNewMoon: referenceNewMoonForYear(y) });
    } else {
      setPresetPreview(null);
    }
  }

  function applyPreset() {
    const y = parseInt(presetYear, 10);
    if (isNaN(y) || y <= 0) return;
    const preset = buildGregorianPreset(y);
    setEpochDate(preset.epochDate);
    setMonths(preset.months);
    setWeekdays(preset.weekdays);
    setWeekdayInput(preset.weekdays.join(", "));
    setSeasons(preset.seasons);
    setIntercalary(preset.intercalary);
    setMoons(preset.moons);
    setShowPreset(false);
    setPresetYear("");
    setPresetPreview(null);
  }

  async function handleSave() {
    updateWeekdays();
    await saveMutation.mutateAsync({
      campaignId,
      epochDate,
      months,
      weekdays: weekdayInput.split(",").map((s) => s.trim()).filter(Boolean),
      seasons,
      intercalary,
      moons,
    });
    onClose();
  }

  const TABS = ["months", "weekdays", "seasons", "intercalary", "moons"] as const;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
        <DialogHeader className="pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <DialogTitle>Calendar Configuration</DialogTitle>
            <Button
              variant="outline"
              size="xs"
              onClick={() => { setShowPreset((v) => !v); setPresetYear(""); setPresetPreview(null); }}
            >
              <UploadIcon />
              Load preset
            </Button>
          </div>
        </DialogHeader>

        {/* Preset panel */}
        {showPreset && (
          <div className="px-4 py-3 border-b border-border bg-muted/40 shrink-0 space-y-2">
            <p className="text-xs font-medium">Gregorian Calendar Preset</p>
            <p className="text-xs text-muted-foreground">
              Loads the standard Gregorian calendar (12 months, 7-day week) with the epoch set to January 1 of
              the chosen year and a historically accurate lunar reference new moon for that year.
              Existing configuration will be replaced.
            </p>
            <div className="flex items-end gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Year</label>
                <input
                  type="number"
                  min={1}
                  value={presetYear}
                  onChange={(e) => handlePresetYearChange(e.target.value)}
                  placeholder="e.g. 1200"
                  className="mt-0.5 w-28 rounded border border-border bg-background px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary block"
                />
              </div>
              {presetPreview && (
                <div className="text-xs text-muted-foreground space-y-0.5 pb-1">
                  <p>Epoch: <span className="font-mono text-foreground">{String(parseInt(presetYear, 10)).padStart(4, "0")}-01-01</span></p>
                  <p>Reference new moon: <span className="font-mono text-foreground">{presetPreview.referenceNewMoon}</span></p>
                  <p>Lunar cycle: <span className="font-mono text-foreground">29 days</span></p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="xs" onClick={applyPreset} disabled={!presetPreview}>
                Apply preset
              </Button>
              <Button variant="ghost" size="xs" onClick={() => { setShowPreset(false); setPresetYear(""); setPresetPreview(null); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Epoch date */}
        <div className="px-4 pt-3 shrink-0">
          <label className="text-xs font-medium text-muted-foreground">Campaign start date (epoch)</label>
          <input
            type="text"
            value={epochDate}
            onChange={(e) => setEpochDate(e.target.value)}
            placeholder="0001-01-01"
            className="mt-1 w-40 rounded border border-border bg-background px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-3 shrink-0">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={["px-2.5 py-1 rounded text-xs capitalize transition-colors",
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              ].join(" ")}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab body */}
        <div className="flex-1 overflow-y-auto py-2 space-y-2 min-h-0">
          {tab === "months" && (
            <>
              {months.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                  <input value={m.name} onChange={(e) => updateMonth(i, { name: e.target.value })} placeholder="Month name" className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
                  <input type="number" value={m.days} min={1} onChange={(e) => updateMonth(i, { days: parseInt(e.target.value) || 1 })} className="w-16 rounded border border-border bg-background px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
                  <span className="text-xs text-muted-foreground">days</span>
                  <IconButton variant="ghost" size="icon-xs" onClick={() => removeMonth(i)} className="hover:text-destructive" tooltip="Remove month"><XIcon /></IconButton>
                </div>
              ))}
              <Button variant="ghost" size="xs" onClick={addMonth} className="text-muted-foreground"><PlusIcon />Add month</Button>
            </>
          )}

          {tab === "weekdays" && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Enter weekday names in order, comma-separated.</p>
              <textarea
                value={weekdayInput}
                onChange={(e) => setWeekdayInput(e.target.value)}
                rows={3}
                className="w-full rounded border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Sunday, Monday, Tuesday..."
              />
              <p className="text-xs text-muted-foreground mt-1">{weekdays.length} day week</p>
            </div>
          )}

          {tab === "seasons" && (
            <>
              {seasons.map((s, i) => (
                <div key={i} className="rounded border border-border p-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input value={s.name} onChange={(e) => updateSeason(i, { name: e.target.value })} placeholder="Season name" className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
                    <IconButton variant="ghost" size="icon-xs" onClick={() => removeSeason(i)} className="hover:text-destructive" tooltip="Remove season"><XIcon /></IconButton>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>From</span>
                    <span>month</span><input type="number" value={s.startMonth} min={1} onChange={(e) => updateSeason(i, { startMonth: parseInt(e.target.value) || 1 })} className="w-12 rounded border border-border bg-background px-1 py-0.5 font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
                    <span>day</span><input type="number" value={s.startDay} min={1} onChange={(e) => updateSeason(i, { startDay: parseInt(e.target.value) || 1 })} className="w-12 rounded border border-border bg-background px-1 py-0.5 font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
                    <span>to month</span><input type="number" value={s.endMonth} min={1} onChange={(e) => updateSeason(i, { endMonth: parseInt(e.target.value) || 1 })} className="w-12 rounded border border-border bg-background px-1 py-0.5 font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
                    <span>day</span><input type="number" value={s.endDay} min={1} onChange={(e) => updateSeason(i, { endDay: parseInt(e.target.value) || 1 })} className="w-12 rounded border border-border bg-background px-1 py-0.5 font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                </div>
              ))}
              <Button variant="ghost" size="xs" onClick={addSeason} className="text-muted-foreground"><PlusIcon />Add season</Button>
            </>
          )}

          {tab === "intercalary" && (
            <>
              <p className="text-xs text-muted-foreground">Intercalary periods are extra days inserted after a given month.</p>
              {intercalary.map((ic, i) => (
                <div key={i} className="rounded border border-border p-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input value={ic.name} onChange={(e) => updateIC(i, { name: e.target.value })} placeholder="Period name" className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
                    <IconButton variant="ghost" size="icon-xs" onClick={() => removeIC(i)} className="hover:text-destructive" tooltip="Remove intercalary period"><XIcon /></IconButton>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>After month</span>
                    <input type="number" value={ic.afterMonth} min={1} onChange={(e) => updateIC(i, { afterMonth: parseInt(e.target.value) || 1 })} className="w-12 rounded border border-border bg-background px-1 py-0.5 font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
                    <span>·</span>
                    <input type="number" value={ic.days} min={1} onChange={(e) => updateIC(i, { days: parseInt(e.target.value) || 1 })} className="w-12 rounded border border-border bg-background px-1 py-0.5 font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
                    <span>days</span>
                    <label className="flex items-center gap-1 ml-2">
                      <input type="checkbox" checked={ic.outsideWeeks} onChange={(e) => updateIC(i, { outsideWeeks: e.target.checked })} />
                      outside weeks
                    </label>
                  </div>
                </div>
              ))}
              <Button variant="ghost" size="xs" onClick={addIC} className="text-muted-foreground"><PlusIcon />Add intercalary period</Button>
            </>
          )}

          {tab === "moons" && (
            <>
              {moons.map((m, i) => (
                <div key={m.id} className="rounded border border-border p-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input value={m.name} onChange={(e) => updateMoon(i, { name: e.target.value })} placeholder="Moon name" className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
                    <IconButton variant="ghost" size="icon-xs" onClick={() => removeMoon(i)} className="hover:text-destructive" tooltip="Remove moon"><XIcon /></IconButton>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Cycle</span>
                    <input type="number" value={m.cycleLength} min={1} onChange={(e) => updateMoon(i, { cycleLength: parseInt(e.target.value) || 1 })} className="w-14 rounded border border-border bg-background px-1 py-0.5 font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
                    <span>days · Reference new moon</span>
                    <input type="text" value={m.referenceNewMoon} onChange={(e) => updateMoon(i, { referenceNewMoon: e.target.value })} placeholder="YYYY-MM-DD" className="w-28 rounded border border-border bg-background px-1 py-0.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                </div>
              ))}
              <Button variant="ghost" size="xs" onClick={addMoon} className="text-muted-foreground"><PlusIcon />Add moon</Button>
            </>
          )}
        </div>

        <DialogFooter showCloseButton>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
