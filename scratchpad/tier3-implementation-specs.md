# Tier 3 Implementation Specs — 3.1, 3.3, 3.4, 3.5

Per-item build instructions for the roadmap in
`~/.claude/plans/read-current-repo-identify-concurrent-panda.md`.

Ground rules for every item:
- Next.js 16.2.2 App Router. Read `node_modules/next/dist/docs/` before novel Next APIs.
- After **any** `prisma/schema.prisma` edit: `npx prisma migrate dev --name <desc>` **and** `npx prisma generate`. Skipping generate → runtime "Unknown argument" errors.
- No test framework wired except NPC Vitest paths in `src/__tests__/`. Where you touch a pure engine (dice, tables, calendar), add a Vitest spec next to existing ones if a runner exists; otherwise leave a `// TODO test` and verify via `npm run build` + manual `npm run dev` click-through.
- Match surrounding code style. Server routes use `requireSession` + campaign-ownership check (see any route in `src/app/api/`). Hooks follow the TanStack pattern in `src/hooks/useCalendar.ts`. Client state via Zustand only where already used.
- Do **not** touch items outside your assigned number. Each item ships as its own commit; reviewer gates between them.
- Always finish with `npm run build` green.

---

## 3.3 — Richer dice grammar (do FIRST; 3.4 depends on the shared roller)

**Problem.** `src/lib/dice/roller.ts` `DICE_PATTERN = /^(\d+)d(\d+)$/i` rejects `1d6+2`, `d20`, `d%`, keep/drop. `parseDiceExpression` **throws** on any non-match → a malformed `diceExpression` or prerequisite dice 500s the whole roll route. Meanwhile `src/lib/dice/outcome-expander.ts` already parses `NdM±K` inline. Grammar is duplicated and divergent.

**Goal.** One tolerant grammar in `roller.ts`, reused by `outcome-expander.ts` and `sub-roll.ts`. Graceful failure, never throw to the route.

**Grammar to support** (case-insensitive, trim first):
- `NdM` (existing)
- `dM` → count defaults to 1 (`d20` == `1d20`)
- `NdM±K` → flat modifier (`2d6-1`, `1d8+2`)
- `d%` / `Nd%` → `%` means 100 sides (`d%` == `1d100`)
- Keep/drop: `NdMkhX` (keep highest X), `NdMklX` (keep lowest X). `kh`/`kl` with no number → keep 1. Applies after rolling all N dice; total is sum of kept dice, then ± flat modifier if present (`4d6kh3+1`).

**Types** (`src/types/table.ts`, extend `DiceExpression`):
```ts
export interface DiceExpression {
  count: number;
  sides: number;
  raw: string;
  modifier?: number;                 // flat ±K, default 0
  keep?: { mode: "h" | "l"; count: number } | null;
}
```
`DiceRollResult.rolls` stays the full rolled array; add `kept: number[]` (the dice that counted) so the UI can show drops. Keep `total` = sum(kept) + modifier. Update the `DiceRollResult` interface accordingly. **Audit all readers of `DiceRollResult`** (`grep -rn "\.total\|\.rolls" src`) — `total` semantics are unchanged so existing readers stay correct; `rolls` still exists.

**roller.ts changes:**
- New regex, single pass with named-ish groups:
  `^(\d*)d(\d+|%)(?:(kh|kl)(\d*))?([+-]\d+)?$`
  - group1 count: empty → 1
  - group2 sides: `%` → 100
  - group3/4 keep mode + optional count (empty → 1)
  - group5 flat modifier
- `parseDiceExpression(raw)` returns `DiceExpression | null` on no-match (do **not** throw). Add `parseDiceExpressionOrThrow` only if an existing caller genuinely needs the throw — prefer null everywhere.
- `rollDice(expr)`: roll `count` dice; if `keep`, sort and slice to keep highest/lowest `keep.count`; `total = sum(kept) + (modifier ?? 0)`. Clamp `keep.count` to `[1, count]`.
- `rollExpression(raw)`: parse; if null, return a sentinel result — `{ expression:{count:0,sides:0,raw,modifier:0,keep:null}, rolls:[], kept:[], total:0 }` — **do not throw**. Callers that currently rely on a throw are being changed here.
- `isValidDiceExpression(raw)`: `parseDiceExpression(raw) !== null`.
- Guard degenerate input: `sides < 1` or `count < 1` or `count > 1000` → treat as invalid (null).

**outcome-expander.ts:** replace its two local regexes' evaluation with `rollExpression`/`parseDiceExpression` from roller where it currently hand-rolls `NdM` and `NdM±K`. Keep the two scanning patterns (they find spans in prose), but route the actual dice math through `rollExpression(diceExpr + modifierStr)` so behavior is single-sourced. Pattern-A (`24-1d6`, constant-minus-dice) has no roller equivalent — keep its bespoke evaluate but call `rollExpression(diceExpr)` for the dice part. Preserve the existing overlap/tie-break logic exactly.

**sub-roll.ts:** already calls `rollExpression("1d"+sides)`; no change needed beyond confirming it still compiles against the new return shape.

**Route safety:** in `src/lib/tables/engine.ts` `rollOnTable`, a bad `table.diceExpression` now yields the zero-sentinel instead of a throw. Add a guard: if `rollExpression(table.diceExpression).expression.sides === 0`, short-circuit to a result whose outcome text is `"Invalid dice expression: <raw>"` (mirror the prerequisite "No encounter" early-return shape) rather than indexing into empty rows. Same defensive check before the prerequisite roll.

**Verification.**
- Add/extend a Vitest spec for roller: `d20`→1 die; `d%`→100 sides; `2d6+1` range [3,13]; `4d6kh3` drops lowest, total in [3,18]; `garbage`→null / zero-sentinel, no throw.
- `npm run build`.
- `npm run dev`: a table whose row outcome contains `2d6+1 orcs` and another with `roll d20`; roll it, confirm expansion. Set a table's dice expression to `d%`, roll, confirm no 500.

---

## 3.4 — Table engine completions (depends on 3.3 roller)

Four sub-tasks. Land as one commit.

### (a) `multiply_chance` — REMOVE the dead variant
`grep -rn "multiply_chance" src` → only declared in `src/types/table.ts:35`, never created in UI, never handled in `modifier-resolver.ts`. There is no coherent "chance" quantity in the additive roll model to multiply. **Decision: remove it**, not implement.
- Delete the `| { type: "multiply_chance"; factor: number }` arm from `ModifierExtraConfig`.
- Update the schema comment on `TableModifier.extraConfig` (`prisma/schema.prisma:255`) that cites `multiply_chance` as the example — replace with `override_outcome` or `prev_result_condition`.
- Confirm nothing in `campaign-transfer.ts` / import zod depends on it (it passes `extraConfig` as opaque string — fine).

### (b) Encounter windows — generalize beyond `[0]`/`[1]`
`encounterWindowsJson` is an arbitrary array but every consumer hardcodes `windows[0]` (day) / `windows[1]` (night):
`calendar/advance/route.ts:246-248`, `calendar/forecast/route.ts:229-231`, `calendar/reroll-region/route.ts:93-95`, and `dungeon/advance-turn/route.ts:100`.
- The persisted encounter-summary state (`CampaignState.calendarEncounterStateJson`, shape `{ date, day, night }` per `EncounterSummary` in `useCalendar.ts`) currently hardcodes two slots. Generalize the produced structure to `windows: EncounterSummary[]` keyed by window index while **keeping `day`/`night` populated for backward compat** (window 0 → also `day`, window 1 → also `night`) so existing UI (`CalendarPanel`, `AppShell`) keeps rendering. Do not break the two-slot readers; add the array alongside.
- In each of the three calendar routes, loop over all `windows` producing one `EncounterSummary` per window (label = `window.name`) instead of two hand-written blocks. Preserve `rollEncounterTime(window)` behavior per window.
- `TablesPanel.tsx` already maps over `encounterWindows` for the timing selector — good, leave client UI as is; it will now receive N summaries.
- Keep effort bounded: if generalizing the persisted summary shape balloons the diff, the **minimum acceptable** change is looping the route-side roll over all windows and emitting an array; the calendar summary panel may still show only the first two. Flag any deferral in the commit body.

### (c) Sub-roll "for each" count — derive from text
`src/lib/tables/sub-roll.ts:44` first pattern hardcodes `count: () => 2` for "roll dN for each X". Derive the real count:
- The count should come from context. Support explicit forms in the outcome text: `"roll a d6 for each of the 3 groups"` → 3; `"roll a d20 for each side"` with no number → fall back to a sensible default.
- Extend the pattern to optionally capture a leading integer in the "each" clause: `for\s+each\s+(?:of\s+(?:the\s+)?)?(\d+)?\s*(\w+)`. If the integer is present, `count = that`. If absent, keep the current default of `2` (combat's two sides) — but pull that default into a named const `DEFAULT_FOR_EACH_COUNT = 2` with a comment explaining it's the two-combatant-sides assumption.
- Guard: clamp derived count to `[1, 20]` to avoid a pathological `for each 999`.
- Do not regress the existing "each side" → 2 behavior.

### (d) Duplicate-table action + table search in manager
- **Search:** `TableManagerModal` list — add a typeahead filter box. Reuse the `Combobox` primitive pattern already adopted in `TablesPanel` (roadmap 2.1, commit `0a7ec88`) or the search/filter/sort pattern in `src/components/npc/NpcBrowser.tsx:30`. Filter by table name (case-insensitive substring); optionally also filter by category.
- **Duplicate action:** add a "Duplicate" button per table row. Server: add `POST /api/random-tables/[id]/duplicate` that deep-copies one table (rows + modifiers + region joins) within the same campaign, name suffixed `" (copy)"`, wrapped in `prisma.$transaction`. Mirror the field list in `campaign-transfer.ts` `createCampaignFromData` table block so no field is dropped (category, seasonName, surprise, prerequisite, applicableModes, manualModifier, npcForType/Gender, sortOrder). Reset stateful fields on the copy (`lastResult`, `lastModifiedResult`, forecast* → null). Add a `useDuplicateTable` hook + wire the button; invalidate the tables query on success.

**Verification.**
- `multiply_chance`: `grep -rn multiply_chance src` returns nothing; build green.
- Windows: configure 3 encounter windows on a campaign; advance a day; confirm 3 encounter summaries produced (inspect network response / DB `calendarEncounterStateJson`); day & night panels still render.
- Sub-roll: table row `"roll a d6 for each of the 3 groups"` → 3 sub-rolls; `"roll a d20 for each side"` → 2.
- Duplicate: duplicate a table with modifiers + region links + prerequisite; diff copy vs original — identical except id/name/stateful nulls.
- `npm run build`.

---

## 3.1 — Calendar events engine (largest item; own commit)

**Problem.** No recurring events / holidays / countdowns. `CalendarNote` is one free-text note per date; `CalendarPanel.tsx` even reads only `notes[0]` in the day sheet. Events are discoverable only via day dots.

**Goal.** A `CalendarEvent` model with one-off and recurring occurrences, a "days until" countdown, month-grid markers, an upcoming-events list, and a searchable all-notes/all-events view — all in the campaign's custom calendar.

### Schema (`prisma/schema.prisma`)
```prisma
model CalendarEvent {
  id           String   @id @default(cuid())
  campaignId   String
  campaign     Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  title        String
  description  String?              // optional TipTap JSON or plain text; plain text is fine v1
  // Recurrence discriminator: "ONCE" | "ANNUAL" | "MONTHLY" | "MOON_PHASE"
  recurrence   String   @default("ONCE")
  // Anchor date "YYYY-MM-DD" (campaign calendar). For ONCE: the date.
  // For ANNUAL: year ignored, month+day used. For MONTHLY: day-of-month used.
  anchorDate   String
  // Optional end date for multi-day ONCE events (inclusive); null = single day.
  endDate      String?
  // MOON_PHASE recurrence targeting:
  moonId       String?              // which moon
  moon         Moon?    @relation(fields: [moonId], references: [id], onDelete: Cascade)
  moonPhase    String?              // one of the 8 MoonPhase names, e.g. "full"
  color        String   @default("#93c5fd")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([campaignId])
}
```
Add `calendarEvents CalendarEvent[]` to `Campaign` and `events CalendarEvent[]` to `Moon`. Run migrate + generate.

### Occurrence engine (`src/lib/calendar/events.ts`, new, PURE)
Reuse `dateToAbsoluteDays` / `absoluteDaysToDate` / `parseDate` / `formatDate` from `engine.ts` and `computeMoonPhase` from `moon.ts`.

```ts
export interface EventOccurrence {
  event: CalendarEvent;
  date: CalendarDateString;      // the occurrence date in campaign calendar
  daysUntil: number;             // signed; 0 = today, negative = past
}

// Return every occurrence of `events` within [fromDate, toDate] inclusive.
export function occurrencesInRange(
  events: CalendarEvent[], fromDate, toDate, config): EventOccurrence[]

// Return the next occurrence (daysUntil >= 0) of each event on/after `fromDate`,
// sorted ascending by daysUntil. Used by the "upcoming events" list.
export function upcomingEvents(
  events, fromDate, config, limitDays = yearLength(config)): EventOccurrence[]
```
Rules per `recurrence`:
- `ONCE`: occurrence on `anchorDate` (+ each day through `endDate` if multi-day, for range queries — for "upcoming", the start date only).
- `ANNUAL`: month+day of `anchorDate`, every year in range. Handle a day that doesn't exist in a given month gracefully (skip; months are fixed-length here so fine).
- `MONTHLY`: day-of-month of `anchorDate`, every month in range; skip months shorter than that day.
- `MOON_PHASE`: for each date in range, compute the moon's phase via `computeMoonPhase`; occurrence when phase === `moonPhase`. Add a helper `nextPhaseDate(moon, phase, fromDate, config)` that walks forward day-by-day (bounded by `moon.cycleLength * 2`) — cheap, `moon.ts` already computes phase. Use it for `upcomingEvents` so you don't scan a whole year.

Keep it pure and unit-testable.

### API (`src/app/api/calendar/events/`)
Mirror `notes/route.ts` + `notes/[id]/route.ts` exactly (same auth + ownership pattern):
- `GET  /api/calendar/events?campaignId=` → all events for campaign.
- `POST /api/calendar/events` → create (zod: title, recurrence enum, anchorDate, optional description/endDate/moonId/moonPhase/color).
- `PATCH /api/calendar/events/[id]` → update; re-verify ownership via the event's campaign.
- `DELETE /api/calendar/events/[id]`.

### Hook (`src/hooks/useCalendar.ts`, extend)
Add `useCalendarEvents`, `useCreateCalendarEvent`, `useUpdateCalendarEvent`, `useDeleteCalendarEvent` — copy the notes hooks verbatim, queryKey `["calendar-events", campaignId]`.

### UI (`src/components/calendar/CalendarPanel.tsx`)
- **Month grid:** alongside the existing note dot (`hasNote`/`noteDateSet` at ~line 577), compute occurrences for the visible month via `occurrencesInRange(events, firstOfMonth, lastOfMonth, config)` and render a small colored pip (event.color) per day that has an occurrence. Multiple → stack up to ~3.
- **Upcoming events list:** new collapsible section in the panel showing `upcomingEvents(events, currentDate, config)` — title, resolved occurrence date (format via existing month-name lookup), and "in N days" / "today". Clicking an entry navigates the grid to that month (`setViewYear/setViewMonth` — see existing nav state).
- **Event editor:** a `Dialog` (use `src/components/ui/dialog.tsx`, consistent with 2.4) to create/edit an event: title, recurrence select, anchor date picker (reuse the panel's existing date-selection UX), optional end date (ONCE only), moon + phase selectors (MOON_PHASE only, populated from `config.moons`), color swatch (reuse the 16-swatch set from flags if present, else event's default). Add an "Add event" button near the upcoming list.
- **Searchable all-notes/all-events view:** a Dialog or panel section with a search box filtering across both notes (by date + plaintext of TipTap content) and events (by title/description). This addresses the roadmap gripe that notes are only reachable via day dots. Keep it read-with-jump: clicking a result jumps the grid to that date and opens its day sheet.

Do not regress existing note behavior. Events are additive.

### Transfer (coordinate with 3.5 — whichever lands second adds the other's block)
`CalendarEvent` must be exported/imported. Add to `campaign-transfer.ts`: serialize events with `moonId` resolved to `moonName` (moons are name-unique within a config), re-resolve on create after moons exist. Add zod to `import/route.ts`. If 3.5 lands first, follow its established SavedNpc pattern; if 3.1 lands first, just add the events block and note in the commit that 3.5 will extend.

**Verification.**
- `events.ts` Vitest: ANNUAL event recurs each year; MONTHLY skips short months; MOON_PHASE lands on full-moon dates matching `computeMoonPhase`; `daysUntil` sign correct across today.
- `npm run dev`: create a one-off holiday, an annual holiday, a "next full moon" event; confirm grid pips, upcoming list ordering, countdown text; edit + delete; search finds a note by its text.
- Export a campaign with events → reimport → events survive with correct moon linkage.
- `npm run build`.

---

## 3.5 — Export/import gaps (own commit; import already transactional)

**Note:** the roadmap says "wrap import in `$transaction`" — this is **already done** (`import/route.ts:179` wraps `createCampaignFromData` in `prisma.$transaction(..., { timeout: 30000 })`, and the creator is fully tx-based). So 3.5 reduces to **adding the missing entities/fields** to the single transfer module. Everything below is edits to `src/lib/campaign-transfer.ts` + the import zod in `src/app/api/campaigns/import/route.ts`. One serializer/creator serves export, import, and duplicate — do not fork.

### (a) SavedNpc + NpcAffiliation (NPC library currently lost on transfer)
- Add `savedNpcs` and `npcAffiliations` to `campaignTransferInclude`.
- Extend `CampaignTransferPayload` with:
  - `npcAffiliations: Array<{ name: string }>` (id-free; name is the join key — **verify affiliation names are effectively unique per campaign**; if not, fall back to index-based mapping and document it).
  - `savedNpcs: Array<{ ...all scalar fields..., affiliationName: string | null }>` — copy every scalar column from the `SavedNpc` model (name, gender, age, type, typeLabel, secondaryType, secondaryTypeLabel, physicalJson, personalityJson, detailsJson, isDeceased, isPinned, notes, isCombatant, combatAc, combatHd, combatMaxHp, combatAttackBonus, combatAttackDamage). **Do not** copy id/campaignId/timestamps.
- `serializeCampaign`: build an `affiliationIdToName` map; emit affiliations, then saved NPCs with `affiliationName` resolved.
- `createCampaignFromData`: create affiliations first, build `affiliationNameToId`, then create saved NPCs re-linking `affiliationId` by name (null when unmatched). Place after NPC profiles.
- `import/route.ts`: add `npcAffiliationSchema` and `savedNpcSchema` (permissive, all optional-with-defaults matching model defaults) and wire into `importSchema.campaign`.

### (b) Stateful / in-progress fields (currently in-progress weather lost)
Serialize + recreate these so a mid-session transfer keeps state:
- `RandomTable`: `lastResult`, `lastModifiedResult`, `forecastResult`, `forecastModifiedResult`, `forecastDate`, `forecastOutcome`. Add to payload's `randomTables[]`, serializer, and creator's `randomTable.create`. Add to import `tableSchema`.
- `CampaignState`: `todayWeatherJson`, `currentDungeonRegionName` (region id → name; already have `currentRegionName`/`currentDungeonRegionName` in payload — confirm `currentDungeonRegionName` is actually wired in the creator; the serializer emits it but the creator's `state.create` at line 325-332 omits both dungeon region and forecast/weather — extend the creator's post-region `campaignState.update` to also set `todayWeatherJson`), plus the two newer session columns `encounterPanelStateJson` and `calendarEncounterStateJson`.
  - Payload `state` gains: `todayWeatherJson?: string | null`, `encounterPanelStateJson?: string | null`, `calendarEncounterStateJson?: string | null`.
  - Serializer reads them off `campaign.state`.
  - Creator: set them in the `state.create` block (they carry no cross-references — safe to set directly).
  - Import `state` zod gains the three optional nullable strings.

### (c) Version bump + back-compat
- Bump export `version` 2 → 3 in `export/route.ts`.
- Import must still accept v2 files: all new fields are optional/defaulted in zod, so v2 imports simply omit them. **Test a v2 file imports clean.**

### Duplicate route
Duplicate (`campaigns/[id]/duplicate/route.ts`) already reuses `serializeCampaign` + `createCampaignFromData` (roadmap 1.1). Adding fields to the shared module means duplicate picks them up for free — **confirm** duplicate now also copies saved NPCs and stateful fields; no separate edit expected.

**Verification.**
- Campaign with saved NPCs (some affiliated, some deceased/pinned), in-progress `todayWeatherJson`, a stateful table with `lastResult` set: export → JSON contains all of it → import into a fresh campaign → NPC library, affiliations, weather, and lastResult all present.
- Duplicate the same campaign → saved NPCs + state copied.
- Import an old v2 export → succeeds, new fields default.
- `npm run build`.
