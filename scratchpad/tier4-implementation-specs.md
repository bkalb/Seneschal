# Tier 4 — Tech-Debt Enablers: Implementation Specs

Survey date: 2026-07-24. Branch `main` @ `ed7325e`. Repo clean at survey time.

These specs correct several stale claims in the roadmap (`~/.claude/plans/read-current-repo-identify-concurrent-panda.md`). Read the "Corrections to roadmap" section first.

## Corrections to roadmap (verified against code)

| Roadmap claim | Reality |
|---|---|
| "Transactions on import, duplicate, calendar/advance" | import + duplicate **already** transactional (`campaigns/import/route.ts:231`, `campaigns/[id]/duplicate/route.ts:29`, both via `createCampaignFromData` + `{ timeout: 30000 }`). Only `calendar/advance` and 3 others remain. |
| "`tableInclude` duplicated in ≥4 places" | Canonical version exists at `src/lib/tables/shape-table.ts`. Only **2** stragglers remain: `combat-side/route.ts:28-45`, `random-tables/[id]/roll/route.ts:15-32`. |
| "Engine unit tests — zero coverage" | Vitest is configured (`vitest.config.ts`, `npm test`). Existing: `roller.test.ts`, `sub-roll.test.ts`, `calendar-events.test.ts`, plus NPC paths. Still uncovered: calendar/engine, moon, tables/engine, modifier-resolver, encounter-roll, encounter-timing, outcome-expander. |
| "`as any` for fields missing from generated Prisma types — regenerate client" | Client is **already** correct (`npx prisma migrate status` → up to date, 17 migrations; `forecastingMode`/`todayWeatherJson`/`encounterWindowsJson` all present in `node_modules/.prisma/client/index.d.ts`). The 6 route casts are **stale leftovers** — just delete them. The 4 component casts have a *different* root cause: drift in `src/types/table.ts`, not Prisma. |
| — (not in roadmap) | **`npx tsc --noEmit` is currently RED**: 8 pre-existing errors, all in `src/__tests__/`. `npm run build` passes because Next only typechecks the build graph. Must be fixed for T4.3 to be verifiable. |
| — (not in roadmap) | **`calendar/forecast/route.ts:133` and `:195` still use fire-and-forget `.catch(() => {})`** — Tier 1.5 fixed `advance` but missed `forecast`. Real bug: unawaited writes can be dropped when the route handler returns. |

## Execution order (mandatory — each builds on the last)

1. **T4.3** — types + `as any` (no behavior change; makes `tsc --noEmit` green)
2. **T4.4** — engine unit tests (safety net; needs T4.3's corrected types)
3. **T4.2** — unify table shaping (verified by T4.4's tests)
4. **T4.1** — transactions (riskiest; lands with tests + unified shaping already in place)

---

# T4.3 — Kill `as any`; fix type drift

10 `as any` sites, three distinct root causes. Also fix the red `tsc` baseline.

## 4.3a — Stale route casts (6 sites, pure deletion)

The generated Prisma client already has these fields. Delete the casts:

| File | Line | Current | Becomes |
|---|---|---|---|
| `src/app/api/calendar/advance/route.ts` | 50 | `(campaign.state as any)?.forecastingMode ?? false` | `campaign.state?.forecastingMode ?? false` |
| `src/app/api/calendar/advance/route.ts` | 248 | `parseEncounterWindows((campaign as any).encounterWindowsJson ?? "[]")` | `parseEncounterWindows(campaign.encounterWindowsJson)` |
| `src/app/api/calendar/forecast/route.ts` | 50 | `(campaign.state as any)?.todayWeatherJson ?? null` | `campaign.state?.todayWeatherJson ?? null` |
| `src/app/api/calendar/forecast/route.ts` | 231 | same windows cast | `parseEncounterWindows(campaign.encounterWindowsJson)` |
| `src/app/api/calendar/reroll-region/route.ts` | 95 | same windows cast | same |
| `src/app/api/dungeon/advance-turn/route.ts` | 100 | same windows cast | same |

Notes:
- `parseEncounterWindows(json: string | null | undefined)` (`src/lib/encounter-timing.ts:30`) already handles null/undefined/garbage, so dropping `?? "[]"` is safe. **Verify** by reading that function before you change the call sites; if it does not in fact tolerate null, keep the `?? "[]"`.
- `Campaign.encounterWindowsJson` is `String @default("[]")` (non-null) in the schema. If the generated type surfaces as `string | null` in the fetched shape, keep `?? "[]"` rather than adding a cast back.
- Each of these four routes fetches `campaign` with `include: { state: true, ... }`, so `campaign.state` is typed and nullable — keep the `?.`.

## 4.3b — `src/types/table.ts` drift (4 component casts + 1 test error)

`RandomTable` is missing the four forecast columns that exist in `prisma/schema.prisma` and are read/written by the calendar routes:

```ts
// add to interface RandomTable in src/types/table.ts
  forecastResult: number | null;
  forecastModifiedResult: number | null;
  forecastDate: string | null;      // "YYYY-MM-DD" in the campaign's calendar
  forecastOutcome: string | null;
```

Confirm the exact names/types against `awk '/^model RandomTable/,/^}/' prisma/schema.prisma` before adding — do not guess. This alone fixes `src/__tests__/NpcCreatorModal.test.tsx:69`.

Then add draft (pre-persist) input types. Root cause of the component casts: `useCreateTable` / `useUpdateTable` (`src/hooks/useRandomTables.ts:25,47`) demand full `TableRow` / `TableModifier` including server-assigned `id` and `tableId`, but callers legitimately send rows/modifiers that have neither.

```ts
// src/types/table.ts
export type TableRowInput = Omit<TableRow, "id" | "tableId">;
export type TableModifierInput = Omit<TableModifier, "id" | "tableId"> & { id?: string };
```

`TableModifierInput` keeps `id` optional because `TableEditModal` PATCHes a mix of existing modifiers (with id) and new ones (without). **Verify this against the PATCH handler** in `src/app/api/random-tables/[id]/route.ts` — match whatever the zod schema there actually accepts; the type must describe the wire format, not the other way around. Do not loosen the zod schema.

Then rewrite the two hook signatures so `rows`/`modifiers` use the input types, and delete:
- `src/components/tables/TableEditModal.tsx:251` `as any`
- `src/components/tables/TableEditModal.tsx:255` `as any`
- `src/components/tables/TableImportWizard/index.tsx:78` `as any`

For `TableImportWizard`, the cast is on the whole object — it is missing fields that `Omit<RandomTable, "id" | "sortOrder" | "lastResult">` requires (e.g. `manualModifier`, `applicableModes`, `npcForType`, prerequisite fields, `lastModifiedResult`). Prefer defining an explicit `CreateTableInput` type in `src/types/table.ts` with the genuinely-optional fields marked optional, and use it as the `useCreateTable` mutation input. Cross-check every field against the POST zod schema in `src/app/api/random-tables/route.ts` — required in zod ⇒ required in the type; `.default()`/`.optional()` in zod ⇒ optional in the type.

## 4.3c — FlagStrip cast (1 site)

`src/components/flags/FlagStrip.tsx:124` — `createMutation.mutateAsync(data as any)`. `FlagEditModal`'s `SaveData` (`src/components/flags/FlagEditModal.tsx:11`) and `useCreateFlag`'s inline input type (`src/hooks/useFlags.ts:29-35`) describe the same payload but disagree. Fix by exporting one shared type (put it next to the hook, e.g. `export type FlagInput = {...}` in `src/hooks/useFlags.ts`, or in a types module if that fits the codebase better) and having `FlagEditModal` import it. Reconcile against `prisma.CampaignFlag` + the POST zod schema in `src/app/api/flags/route.ts`. Delete the cast.

## 4.3d — Green the `tsc --noEmit` baseline

7 remaining errors, all `SavedNpcData` fixture drift in tests. `SavedNpcData` gained `isCombatant`, `combatAc`, `combatHd`, `combatMaxHp` + 2 more; fixtures predate them.

Files: `src/__tests__/api-savedNpc.test.ts:10`, `e2e-lifecycle.test.ts:70,108`, `hooks-savedNpcs.test.tsx:22`, `NpcBrowser.test.tsx:30`, `NpcDetailPanel.test.tsx:14`.

Find the canonical `SavedNpcData` definition, then add the missing fields to each fixture with realistic values. **Do not** fix this by casting fixtures to `any` or by making the fields optional in `SavedNpcData` — the whole point of this task is removing casts. If several fixtures are near-identical, factor a `makeSavedNpc(overrides)` helper into a shared test-fixture module and use it; that is preferred over six copies.

## Verification (T4.3)

```bash
npx tsc --noEmit     # must be COMPLETELY clean — zero errors
npm test             # all existing tests still pass
npm run build        # must succeed
grep -rn "as any" src   # expect zero hits
npm run lint
```

If `grep` still shows a hit you could not remove, do **not** leave it silently — report it with the reason. Also: do not swap `as any` for `as unknown as X` or `@ts-expect-error`; that is the same debt wearing a hat. `shape-table.ts` uses `raw: any` params and one `as unknown as RandomTable` — those are **out of scope** for this task (T4.2 owns that file); leave them alone.

---

# T4.4 — Engine unit tests (Vitest)

Add deterministic unit coverage for the pure engine modules, so T4.2 and T4.1 have a regression net. **Do not modify engine source in this task** — if a test reveals a genuine bug, write the test to assert current behavior, mark it `it.skip` with a `// BUG:` comment describing expected vs actual, and report it. Fixing behavior is a separate decision.

## Setup

Vitest is already configured (`vitest.config.ts`, `jsdom`, `globals: true`, alias `@` → `./src`, setup `src/test/setup.ts`). Put new tests in `src/__tests__/`, following the existing naming (`roller.test.ts`, `sub-roll.test.ts`). Read `src/__tests__/roller.test.ts` and `calendar-events.test.ts` first and match their style exactly (`import { describe, it, expect } from "vitest"`, `@/lib/...` imports).

**Determinism.** These engines call `Math.random()`. Two allowed techniques:
1. **Stub** — `vi.spyOn(Math, "random").mockReturnValue(0.5)` (or a scripted queue via `mockReturnValueOnce` chains) inside the test, restored in `afterEach` with `vi.restoreAllMocks()`. Use this whenever you assert an exact outcome.
2. **Range/invariant** — loop 50–200 iterations and assert bounds/invariants, as `roller.test.ts` already does. Use for distribution-ish properties.

Never write a test whose pass/fail depends on unstubbed randomness.

## Files to create

### `src/__tests__/calendar-engine.test.ts` — `src/lib/calendar/engine.ts`

Build 2–3 shared fixture configs at the top of the file (a plain 2-month toy calendar; a realistic 12-month one; one **with intercalary days**). Cover:
- `parseDate` / `formatDate` round-trip, including zero-padding (`0001-01-01`) and years ≥ 1000.
- `dateToAbsoluteDays` ↔ `absoluteDaysToDate` round-trip across a month boundary, a year boundary, and an intercalary day.
- `yearLength` — sums month lengths **and** intercalary days (verify which, from the source).
- `computeWeekday` — advances one weekday per day; **intercalary days sit outside the weekly structure**, so a weekday computed after an intercalary day must not be shifted by it. This is the single most valuable assertion in the file.
- `advanceDate` — day→day, last-day-of-month→next month, last-day-of-year→year+1, into and out of an intercalary day.
- `getCurrentSeason` — inside a season, on both boundary dates (inclusive?), a **year-wrapping** season (e.g. Winter month 12 → month 2), and a date in no season → `null`.
- `firstWeekdayOfMonth` — consistent with `computeWeekday(day 1)`.

### `src/__tests__/moon.test.ts` — `src/lib/calendar/moon.ts`

Read the file (38 lines) and cover `computeMoonPhase` + `computeAllMoonPhases`: phase advances with absolute days, wraps cleanly at the end of a cycle, day 0 / epoch offset behaves, multiple moons with different cycle lengths stay independent, and phase-name boundaries are hit exactly (compute expected day numbers from the cycle length rather than hardcoding).

### `src/__tests__/modifier-resolver.test.ts` — `src/lib/tables/modifier-resolver.ts`

The highest-value target — this drives real GM-visible behavior. Cover `resolveModifiers` and `getVisibleModifiers` for each `ModifierBehavior`:
- `ALWAYS` — applies only when user-toggled; always visible.
- `AUTO_REGION` — applies automatically iff `currentRegionId ∈ autoRegionIds`; not a user toggle.
- `CONDITIONAL_REGION` — visible only when region matches; applies only when *both* region matches and toggled.
- `PREV_RESULT_CONDITION` — with `extraConfig` `{ type: "prev_result_condition", operator, threshold }`, for each of `lte`/`gte`/`eq`, testing at threshold−1/threshold/threshold+1, and with `lastModifiedResult === null`.
- `null` region, multiple modifiers stacking (sum of `rollAdjustment`), and `source` field (`"auto"` vs `"user_toggle"`) on each `AppliedModifier`.

### `src/__tests__/tables-engine.test.ts` — `src/lib/tables/engine.ts`

Cover `rollOnTable` with `Math.random` stubbed:
- Row matching: roll lands in `[min, max]` → correct row; lands on each boundary; **gap/no-match behavior** (assert whatever the source actually does — throw? null? clamp? — read it, don't assume).
- `manualModifier` folded into `diceTotal` while `rawDiceTotal` stays unmodified.
- Modifier adjustments shift the matched row.
- `extraConfig` `{ type: "override_outcome" }` replaces the outcome text.
- Prerequisite roll: `prerequisiteDice` + min/max — passing rolls the table; failing returns the "no encounter" path with `prerequisiteRoll.passed === false` (confirm exact shape from source).
- Invalid `diceExpression` — per Tier 3.3 `parseDiceExpression` returns `null` instead of throwing; assert `rollOnTable` degrades gracefully rather than throwing.

### `src/__tests__/encounter-roll.test.ts` — `src/lib/tables/encounter-roll.ts`

- `lookupOutcomeByRoll` — hit, boundary, and out-of-range.
- `rollEncounterForWindows` — **N windows produce N results in order** (this is the Tier 3.4 generalization; regression-guard it with 0, 1, 2, and 4 windows).
- `rollEncounterFull` — surprise sub-roll uses table-level `surpriseDice`/`surpriseThreshold` when set and falls back to the campaign defaults when not; `reactionTable` null → `reaction` null.

### `src/__tests__/encounter-timing.test.ts` — `src/lib/encounter-timing.ts`

- `parseEncounterWindows` — valid JSON array, `"[]"`, `null`, `undefined`, malformed JSON, and JSON of the wrong shape (object, array of junk). Must never throw. **This is a direct precondition for T4.3a** — assert it explicitly.
- `rollEncounterTime` — result within the window; a **midnight-wrapping** window (e.g. start 18:00, end 06:00) yields a time in either tail, never in the excluded middle. Loop with stubbed randomness at 0, 0.5, and ~1 to hit both edges.
- `formatMinutes` — midnight, noon, 12-hour AM/PM boundaries, minute zero-padding.

### `src/__tests__/outcome-expander.test.ts` — `src/lib/dice/outcome-expander.ts`

`scanAndRollInlineNotation`: plain text passes through unchanged with empty `inlineRolls`; a single `2d6 Bandits` expands with a matching `inlineRolls` entry; multiple notations in one string all expand; the richer Tier 3.3 grammar (`d%`, `d20`, `1d6+2`, `4d6kh3`) is recognized; a non-notation token containing `d` (e.g. "old", "d") is **not** mangled.

## Verification (T4.4)

```bash
npm test             # every test green
npx tsc --noEmit     # still clean (T4.3 left it clean)
npm run lint
```

Report: number of tests added per file, plus any `it.skip`'d suspected bugs with expected-vs-actual.

---

# T4.2 — Unify table include / shaping

Canonical source: `src/lib/tables/shape-table.ts` — exports `shapeTable(raw)` and `tableInclude`. Five routes already import it (`calendar/advance`, `calendar/forecast`, `calendar/reroll-region`, `dungeon/advance-turn`, and others). Two routes still carry hand-rolled copies that have **already drifted**.

## Drift analysis (why replacing is strictly safer, not just tidier)

Canonical `shapeTable` normalizes six things the local copies do not:

| Normalization | canonical | local copies |
|---|---|---|
| `regionIds` | `r.regionId ?? r.id` (tolerates both shapes) | `r.regionId` only |
| `category` cast to `TableCategory` | yes | no |
| `rollWhenNoSeason` default `"always"` | yes | **missing → `undefined`** |
| `npcForType` / `npcForGender` default `null` | yes | missing |
| `applicableModes` default `"BOTH"` | yes | **missing → `undefined`** |
| `behavior` cast | yes | no |

So the local copies can hand `rollOnTable` a table with `applicableModes: undefined` / `rollWhenNoSeason: undefined`. Swapping to canonical removes latent bugs; it cannot introduce a regression on any field, since canonical is a superset that only fills in absent values.

## Changes

### 1. `src/app/api/random-tables/[id]/roll/route.ts`

Local `tableInclude` (lines 15-20) differs from canonical by one key: it adds `campaign: true`. So add a second export to `shape-table.ts` rather than bloating the canonical one:

```ts
/** `tableInclude` plus the owning campaign — for routes that need campaign defaults. */
export const tableIncludeWithCampaign = { ...tableInclude, campaign: true } as const;
```

Then in the roll route: delete the local `tableInclude` (15-20) and local `shapeTable` (22-32), import `{ shapeTable, tableIncludeWithCampaign }` from `@/lib/tables/shape-table`, and point all three `include:` sites (lines 43, 80, 84) at the right one. **Check each of the three individually** — only the ones whose result is used for campaign-default lookup need `campaign: true`; the others should use plain `tableInclude`. Read the surrounding code to decide; do not blanket-replace.

The local `shapeTable` here has no return-type annotation (returns an untyped spread) while canonical returns `RandomTable`. Expect new type errors to surface at the call sites once it is properly typed — that is the point. Fix them properly (add missing fields to the local shape, or widen the consuming signature). If a call site genuinely needs a field `RandomTable` lacks, add it to `src/types/table.ts` (T4.3 established this pattern) rather than casting.

### 2. `src/app/api/combat-side/route.ts`

Delete local `tableInclude` (28-32) and `shapeTable` (34-45); import both from `@/lib/tables/shape-table`. Update the `include:` at line 77 and the call at line 82. This route only rolls trait tables (`rollTraits`, line 47), so the extra normalization is harmless.

### 3. Sweep for further copies

```bash
grep -rn "autoRegions: true" src/app
grep -rn "conditionalRegions" src/app
grep -rn "rows: { orderBy" src/app
```

Any remaining ad-hoc include that matches the canonical shape should be replaced. Any that *deliberately* differs (e.g. omits `modifiers` for a list endpoint that doesn't need them) should be **left alone** — do not force every query through the heavy include and regress list-endpoint performance. Report which ones you left and why.

### 4. Optional, only if trivial

If `shape-table.ts`'s `raw: any` can be typed via `Prisma.RandomTableGetPayload<{ include: typeof tableInclude }>` without cascading changes, do it and drop the `as unknown as RandomTable`. **If it cascades into more than ~3 files, stop and leave it** — note it as a follow-up instead. Not worth blocking this task.

## Verification (T4.2)

```bash
npx tsc --noEmit     # clean
npm test             # green (T4.4's engine tests now guard this)
npm run build
npm run lint
grep -rn "function shapeTable" src/app   # expect zero hits
```

Manual smoke via `npm run dev`: roll a table from the Tables panel (exercises the roll route incl. reaction/surprise path); add a combat side with a trait table selected (exercises `combat-side`).

---

# T4.1 — Transactions on multi-step writers

Riskiest task. Do it last. Import and duplicate are already done — do not touch them.

## Established pattern in this codebase

```ts
const result = await prisma.$transaction(
  (tx) => createCampaignFromData(tx, userId, src),
  { timeout: 30000 }
);
```

Rules that follow from it:
- Interactive `$transaction(async (tx) => {...})` with an explicit `timeout`.
- Everything inside uses `tx.*`, never `prisma.*`. A stray `prisma.*` inside the callback opens a **second** connection and self-deadlocks under SQLite — grep for it before you finish.
- Do all I/O-ish and request work **outside** the transaction: `requireSession()`, `await request.json()`, zod parsing, and the auth/ownership `findUnique`.
- Engine calls (`rollOnTable`, `advanceDate`, `getCurrentSeason`, `parseEncounterWindows`, `buildDaySummaryNodes`) are pure and synchronous — safe inside the callback. Keep them there when a write depends on their output.
- Return the response payload **from** the transaction callback; do not mutate outer `let`s from inside it.
- SQLite via better-sqlite3 serializes writers. Keep transactions short; do not put anything network-bound inside.

## 4.1a — `src/app/api/calendar/advance/route.ts` (primary target)

8 writes, zero transaction. Current failure mode: a mid-route error leaves the campaign date advanced but weather unpersisted, or flags ticked but the calendar note missing — silent, GM-visible corruption of session state.

Writes to bring under one transaction, in order:
1. `campaignState.upsert` — new date (line 77)
2. `randomTable.update` ×N — `lastResult` / `lastModifiedResult` in the pass-1 loop (146)
3. `campaignState.update` — `todayWeatherJson` (156)
4. `randomTable.update` ×N — forecast clear (174) and forecast write (209) in pass 2
5. `calendarNote.update` **or** `.create` (273 / 278)
6. `campaignFlag.update` ×N — counter ticks (294)

Reads that must move inside (they inform later writes, and reading them pre-transaction would race): `randomTable.findMany` for CALENDAR tables (85), the encounter/reaction table lookups (233, 234, 244, 245), the `calendarNote.findFirst` (271), the `campaignFlag.findMany` (286).

Reads that stay outside: the initial `campaign.findUnique` with `state` + `calendarConfig` (31) — it is the auth check and must run before the transaction so a 404/401 short-circuits without opening one.

Shape:

```ts
// ... auth, parse, campaign fetch, calendarConfig guard, date math (all outside)

const payload = await prisma.$transaction(async (tx) => {
  await tx.campaignState.upsert({ ... });
  // weather pass 1, pass 2, encounters, note, flags — all via tx
  return { newDate: newDateStr, dailyRolls: weatherRolls, forecastRolls, dayEncounter, nightEncounter, encounters };
}, { timeout: 30000 });

return NextResponse.json(payload);
```

Preserve behavior exactly: the `weatherRolls` / `forecastRolls` / `encounters` arrays, the `forecastingMode` branching, the pass-2 season-boundary chain fallback (`todayByRegionSet`), the `dayEncounter`/`nightEncounter` back-compat aliases (`encounters[0]`/`[1]`), and the note append-vs-create branch. The declarations of `weatherRolls`, `forecastRolls`, `todayById`, `todayByRegionSet` and the local helper functions (`tablePassesFilter`, `regionSetKey`) can move inside the callback or stay outside — your call, but if they stay outside they must be read-only from within, and the return value must be built from them at the end of the callback.

Note the `campaignState.upsert` at line 77 followed by `campaignState.update` at 156 — inside one transaction these could collapse into a single upsert if `todayWeatherJson` were computed first. **Do not** restructure that way in this task; a mechanical wrap is easier to review. Mention it as a follow-up.

## 4.1b — `src/app/api/calendar/forecast/route.ts` (fix real bug + wrap)

Lines 133 and 195 use fire-and-forget `.catch(() => {})` on `prisma.campaignState.update` and `prisma.randomTable.update`. These are **not awaited** — in a Next route handler the response can return before they land, so a forecast the GM sees on screen may never be persisted, and any failure is swallowed silently.

Fix: `await` both, drop the `.catch(() => {})`, and bring them under one `$transaction` together with the `randomTable.findMany` reads they depend on. Errors should now propagate to a 500 rather than vanishing. Do not add a new swallow-all `try/catch` around the transaction.

Read the whole file first — line 195 is inside a `for` loop over `allCalendarTables`, so N updates need to share the transaction with the surrounding reads.

## 4.1c — `src/app/api/calendar/config/route.ts` (worst data-loss risk of the set)

Lines 77-85: `calendarConfig.upsert` → `moon.deleteMany` → `moon.createMany`. If `createMany` fails after `deleteMany` succeeds, **the campaign's moons are gone**. Wrap all three in one `$transaction`. Small, self-contained, high value.

## 4.1d — `src/app/api/dungeon/advance-turn/route.ts`

`campaignState.upsert` (64) + `activeLightSource.update` ×N (135). A failure mid-loop advances dungeon time while some light sources keep stale remaining-turn counts. Wrap; keep the encounter-check logic and response payload identical.

## 4.1e — `src/app/api/calendar/reroll-region/route.ts` (low priority)

Only 2 writes (lines 125, 130) and they are mutually exclusive branches of an update-or-create — no partial-failure window. **Leave it alone** unless wrapping is genuinely a two-line change; note the decision either way.

## Explicitly out of scope

Checked and confirmed **not** multi-step (writes live in mutually exclusive PATCH/POST/DELETE branches — do not touch):
`combat-side/[id]/route.ts`, `dungeon/light-sources/[id]/route.ts`, `combat-encounter/[id]/route.ts`.

## Verification (T4.1)

```bash
npx tsc --noEmit
npm test
npm run build
npm run lint
grep -n "prisma\." src/app/api/calendar/advance/route.ts   # only the pre-transaction auth fetch may remain
```

Manual, via `npm run dev` — this is the part that actually matters, since there is no integration test suite:
1. **Advance Day**, overland, in a region with an ENCOUNTER table and ≥1 CALENDAR weather table + ≥1 counting flag. Confirm: date advances once, weather appears, calendar note gets the day summary appended (not duplicated), flag counters tick exactly once. Advance several days in a row.
2. **Forecasting mode on** → Advance Day. Confirm today's weather + tomorrow's forecast both show, and that reloading the page restores them (this is what the previously-dropped writes were for). Cross a season boundary and confirm the chain still works.
3. **Calendar config**: edit moons, save, reload — moons persist. Then save with an intentionally bad payload if you can trigger one; confirm the previous moons survive.
4. **Dungeon**: advance turns with ≥2 lit light sources; confirm time advances and every source's remaining turns decrement.
5. Confirm no "Transaction already closed" / "timed out" errors in the dev server console during any of the above.

Report anything you could not verify manually.

---

# Global rules for all four tasks

- **One task per commit.** Message: `refactor(4.x): <summary>` (or `test(4.4):` for the test task, `fix(4.1):` if the forecast fire-and-forget fix is called out separately). End with the `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer per repo convention. **Do not push.**
- **No behavior changes** except the two explicitly sanctioned ones: forecast writes now actually persist and surface errors (4.1b), and shape normalization defaults now apply in two more routes (4.2).
- **No schema changes.** No new migrations. `prisma migrate status` is up to date (17 migrations) and must stay that way. If you believe a schema change is needed, stop and report instead.
- **Never** `npx prisma migrate reset`, `db push --force-reset`, or anything that touches `./dev.db` data. The live DB is root `./dev.db` (`prisma/dev.db` is a stale empty file — ignore it).
- If you touch `prisma/schema.prisma` for any reason, `npx prisma generate` afterward (per CLAUDE.md).
- Read `node_modules/next/dist/docs/` before writing anything Next-version-sensitive (Next 16.2.2 — route handler and `params` semantics differ from older training data).
- Report honestly: if a verification step fails or you skipped it, say so with the output. Do not report a task complete on a red `tsc`, a failing `npm test`, or unverified manual steps.
