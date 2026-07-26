/# NPC Generation History + Per-NPC Re-roll — Implementation Spec

Status: design agreed via grill-me interview. Ready to implement.

## 1. Problem

The NPC generator renders exactly one batch at a time. `NpcPanel` holds
`npcs: GeneratedNpc[]` in local state and `handleGenerate` overwrites it, so
generating again destroys the previous output. There is no way to look back at a
batch, and no way to nudge a single NPC without discarding the whole batch.

Separately, `GeneratedNpc` records only *values* — it has no memory of which
tables produced them — so nothing today can re-roll an NPC "the same way it was
made".

## 2. Goals

1. Generated batches accumulate into a scrollable, persistent history.
2. Retention is user-selectable: last **5 / 10 / 25** result-sets (default 10).
3. Each set is stamped with real-world time, in-game date, region, profile name,
   and NPC count.
4. Any NPC in any set can be re-rolled — whole card or a single field — replaying
   the exact tables that originally produced it.

## 3. Non-goals

- Cross-set batch save (selecting NPCs from set #1 and set #3 into one
  affiliation). Batch save stays scoped to a single set.
- Cross-device sync of history. This is browser-local by design.
- Undo of a re-roll. Re-roll is destructive to the card's previous values.
- Re-rolling gender directly. Gender changes only as a consequence of a
  whole-card re-roll (see §6.2).

## 4. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | History lives in **localStorage**, campaign-scoped, via Zustand `persist` | Matches `rollHistoryStore` precedent; no schema/migration/API work |
| D2 | Each NPC carries a **self-contained recipe** of the tables that made it | Immune to profile edits, profile deletion, and profile switching |
| D3 | Re-roll works at **whole-card and per-field** granularity | Recipe makes per-field nearly free; covers "good NPC, bad name" |
| D4 | Whole-card re-roll **re-applies the original gender *selection*** | Sets made with `?` re-flip gender; sets made with `M` stay male |
| D5 | Re-rolling type **cascades to name only if the resolved name table changes** | Prevents a Talford NPC with a Ruislip name, without gratuitously destroying names |
| D6 | Generate always prepends a new set; the old **"Re-roll" button is deleted** | It already called `handleGenerate` verbatim — a pure duplicate |
| D7 | Trim eagerly to N, plus **QuotaExceededError self-heal** | Worst case ≈1.8 MB in a shared ~5 MB origin budget |
| D8 | Saving is a snapshot: **re-roll clears the badge, DB row untouched** | Saved records accrue notes/combat stats/affiliation that a re-roll must not clobber |
| D9 | Store **raw ids + rendered labels** for the in-game stamp | History is a log; it should survive region deletion and calendar reconfiguration |
| D10 | **All sets always expanded**, continuous scroll, newest first | No expand state to manage or persist |
| D11 | Re-roll uses the **set's captured `regionId`**, not the current region | Keeps each set's contents consistent with its own header |
| D12 | Missing source table → **degrade per-field**, disable that field's ↻ | One deleted table must not brick every historical card that used it |
| D13 | Header shows profile name + NPC count (no mode/dungeon time, no gender) | Avoids threading `mode`/`currentTime` into `NpcPanel` |
| D14 | Retention selector, per-set dismiss, clear-all, **and per-set pinning** | Pinning lets good sets outlive FIFO churn |
| D15 | Scroll window ~60vh clamped, **sticky set headers**, scroll-to-top on generate | With everything expanded, `max-h-96` shows about one set |

## 5. Data model

### 5.1 `src/types/npc.ts` — additions

```ts
/**
 * Everything needed to re-roll an NPC exactly the way it was first made.
 * Fully self-contained: rerollNpc() needs no set or profile context.
 * `nameTableId` is the *resolved* table (resolveNameTable depends on the
 * rolled type + gender), so it is genuinely per-NPC, not per-set.
 */
export interface NpcRecipe {
  /** Region in effect at generation. Replayed on every re-roll (D11). */
  regionId: string | null;
  /** Gender selection in effect at generation. Re-applied on whole-card re-roll (D4). */
  genderSelection: GenderSelection;
  typeTableId: string | null;
  secondaryTypeTableId: string | null;
  ageTableId: string | null;
  nameTableId: string | null;
  physicalTableIds: string[];
  personalityTableIds: string[];
  detailTables: { label: string; tableId: string }[];
}

export interface GeneratedNpc {
  // …all existing fields unchanged…
  /** Present on generated NPCs. Optional so older persisted history hydrates cleanly. */
  recipe?: NpcRecipe;
  /** Id of the library record this card was saved as. Cleared on re-roll (D8). */
  savedNpcId?: string | null;
}

/** Re-roll target for per-field re-roll. */
export type NpcField =
  | { kind: "name" }
  | { kind: "type" }
  | { kind: "secondaryType" }
  | { kind: "age" }
  | { kind: "physical"; index: number }
  | { kind: "personality"; index: number }
  | { kind: "detail"; index: number };
```

> **Size note.** Every field of `NpcRecipe` except `nameTableId` is invariant
> across a set, so a full per-NPC recipe duplicates ~250 bytes per NPC. That was
> the accepted trade (D2): it makes `rerollNpc` a pure function of the NPC alone,
> which keeps the per-field handlers trivial. Hoisting the invariant parts to the
> set is a pure size optimization available later without changing behavior.

### 5.2 `src/types/npcHistory.ts` — new

```ts
import type { GeneratedNpc } from "./npc";

export type NpcHistoryRetention = 5 | 10 | 25;

export interface NpcResultSet {
  id: string;                     // crypto.randomUUID()
  /** Real-world epoch ms. */
  createdAt: number;
  profileId: string;
  /** Snapshotted — survives profile rename/deletion (D9). */
  profileName: string;
  /** Raw campaign date, "YYYY-MM-DD". Null if the campaign has no calendar config. */
  inGameDate: string | null;
  /** Rendered at generation, e.g. "12 Harvestmoon 1247". */
  inGameDateLabel: string | null;
  regionId: string | null;
  /** Rendered at generation. Survives region rename/deletion. */
  regionName: string | null;
  /** Exempt from trimming; does not count toward retention (D14). */
  pinned: boolean;
  npcs: GeneratedNpc[];
}
```

## 6. Generator changes — `src/lib/npc/generator.ts`

### 6.1 Capture the recipe

`generateNpc` already resolves every table it needs. Collect them into an
`NpcRecipe` and attach it to the returned object. `resolveNameTable` is already
called at [generator.ts:90](../src/lib/npc/generator.ts#L90) — capture
`nameTable?.id ?? null`. `generateNpcBatch` needs no signature change.

`generateNpc` gains a `genderSelection` value it already receives, so the only
new inputs are none — this is purely additive output.

### 6.2 `rerollNpc(npc, tableMap, usedNames?)`

```ts
export function rerollNpc(
  npc: GeneratedNpc,
  tableMap: Map<string, RandomTable>,
  usedNames: Set<string> = new Set()
): GeneratedNpc
```

Returns a new `GeneratedNpc`. If `npc.recipe` is absent, returns `npc` unchanged.

1. `gender = resolveGender(recipe.genderSelection)` — D4.
2. For each of `type`, `secondaryType`, `age`: if the recipe's table id resolves
   in `tableMap`, roll it with `recipe.regionId`; **otherwise keep the existing
   value** (D12).
3. Re-resolve the name table: `resolveNameTable(tableMap, newType, gender)`.
   Roll it for a new name, honoring `usedNames` with the existing
   `MAX_REROLLS = 10` dedup loop. Write the resolved id back into the recipe.
   If no name table resolves, keep `npc.name`.
4. `physical[i]`, `personality[i]`, `details[i]`: roll where the table resolves,
   keep the stored value where it does not.
5. `typeLabel` / `secondaryTypeLabel` are copied from the existing NPC — they are
   presentation, not rolled.
6. Return with `savedNpcId: null` (D8) and the updated `recipe`.

`usedNames` should be seeded by the caller with the *other* names in the same set,
so a re-roll doesn't collide with its neighbors.

### 6.3 `rerollNpcField(npc, field, tableMap)`

Rolls exactly one slot with `recipe.regionId`. Two special cases:

- **`{ kind: "type" }`** — after rolling the new type, call
  `resolveNameTable(tableMap, newType, npc.gender)`. If the resolved id differs
  from `recipe.nameTableId`, also re-roll the name and update
  `recipe.nameTableId`. If it is the same table, leave the name untouched (D5).
- **`{ kind: "name" }`** — rolls `recipe.nameTableId` directly. It does *not*
  re-resolve; the pinned table is what this NPC's name comes from.

If the target field's table is missing from `tableMap`, return `npc` unchanged
(the UI disables that ↻ anyway — this is just defense).

Also sets `savedNpcId: null`.

## 7. Calendar helper — `src/lib/calendar/engine.ts`

No shared display formatter exists; `CalendarPanel` builds `monthName` inline at
[CalendarPanel.tsx:323](../src/components/calendar/CalendarPanel.tsx#L323).
Extract one:

```ts
export function formatCampaignDate(s: CalendarDateString, config: CalendarConfig): string
// "1247-08-12" -> "12 Harvestmoon 1247"
```

Mirror the existing fallback exactly — `config.months[m - 1]?.name ?? \`Month ${m}\`` —
so nothing about current rendering changes. Refactor `CalendarPanel` to use it
(optional but recommended; it removes a duplicated fallback).

## 8. Store — `src/stores/npcHistoryStore.ts` (new)

```ts
interface NpcHistoryStore {
  /** Global preference, not per-campaign. */
  retention: NpcHistoryRetention;
  /** Newest-first per campaign. */
  byCampaign: Record<string, NpcResultSet[]>;

  setRetention(n: NpcHistoryRetention): void;
  pushSet(campaignId: string, set: NpcResultSet): void;
  updateNpc(campaignId: string, setId: string, index: number, next: GeneratedNpc): void;
  markSaved(campaignId: string, setId: string, index: number, savedNpcId: string | null): void;
  togglePin(campaignId: string, setId: string): void;
  dismissSet(campaignId: string, setId: string): void;
  clear(campaignId: string): void;
}
```

Persisted under `"dm-npc-history"`, version 1.

### 8.1 Trimming

```ts
function trim(sets: NpcResultSet[], retention: number): NpcResultSet[] {
  const pinned   = sets.filter(s => s.pinned);
  const unpinned = sets.filter(s => !s.pinned).slice(0, retention);
  return [...pinned, ...unpinned].sort((a, b) => b.createdAt - a.createdAt);
}
```

Applied on `pushSet`, on `setRetention` (so lowering the setting trims
immediately — D7), and on `togglePin` when unpinning.

### 8.2 Quota self-heal

Wrap the persist storage:

```ts
const quotaSafeStorage: StateStorage = {
  getItem:    (k) => localStorage.getItem(k),
  removeItem: (k) => localStorage.removeItem(k),
  setItem(k, value) {
    let payload = value;
    for (let attempt = 0; attempt < 64; attempt++) {
      try { localStorage.setItem(k, payload); return; }
      catch (e) {
        if (!isQuotaError(e)) throw e;
        const reduced = evictOldest(payload);   // returns null when nothing left
        if (reduced === null) { toast.error("NPC history storage is full"); return; }
        payload = reduced;
      }
    }
  },
};
```

`evictOldest` parses the payload and drops **the oldest unpinned set across all
campaigns first**; only when no unpinned sets remain does it start dropping the
oldest pinned sets (D14 makes pinned sets otherwise unbounded, so this last
resort is required). `isQuotaError` must match both `QuotaExceededError` (name)
and Safari's legacy code 22 / `NS_ERROR_DOM_QUOTA_REACHED`.

**Known limitation:** after an eviction the in-memory store holds sets that are
no longer on disk. It reconciles on next page load. Optionally call
`useNpcHistoryStore.persist.rehydrate()` after an eviction to reconcile
immediately.

## 9. UI

### 9.1 Component split

`NpcPanel` is already 485 lines. Extract:

| File | Contents |
|---|---|
| `src/components/npc/NpcCard.tsx` | The existing `NpcCard`, moved out of `NpcPanel`, plus re-roll affordances |
| `src/components/npc/NpcResultSetView.tsx` | One set: sticky header + card grid |
| `src/components/npc/NpcHistoryList.tsx` | Scroll container, history header bar, empty state |

### 9.2 `NpcPanel` changes

- **New prop** `currentDate: string`. Wire from
  [AppShell.tsx:221](../src/components/layout/AppShell.tsx#L221) using
  `campaign.state?.currentDate ?? "0001-01-01"` — the same expression already
  passed to `CalendarPanel` at line 288.
- Add `useCalendarConfig(campaignId)` to render `inGameDateLabel` at generation.
  A missing config yields `inGameDateLabel: null` and the stamp is omitted.
- **Delete** `npcs` and `savedIndices` state entirely.
- `handleGenerate` builds an `NpcResultSet` (resolving `profileName` from
  `selectedProfile.name` and `regionName` from `regions.find(...)`) and calls
  `pushSet`, then scrolls the container to top.
- **Delete** the "Re-roll" button at
  [NpcPanel.tsx:379](../src/components/npc/NpcPanel.tsx#L379) (D6).
- **Remove** `setNpcs([])` from the profile-change handler
  ([line 282](../src/components/npc/NpcPanel.tsx#L282)) and from `handleDelete`
  ([line 238](../src/components/npc/NpcPanel.tsx#L238)). Switching or deleting a
  profile must not wipe history.
- The empty state (`No tables configured` / `No profiles yet`) shows only when
  history is empty for this campaign.

### 9.3 History header bar

```
History   [Last 10 ▾]                         Clear
```

`Clear` uses inline confirm (`Sure? ✓ ✗`), matching the combat-side-delete
pattern from commit 5bbffc9 — not a modal.

### 9.4 Set header (sticky)

```
2:14 PM · 12 Harvestmoon 1247 · Ergyng          📌  Save as Group…  ×
Ergyng NPC · 3 NPCs
```

- Real time: `h:mm A` when `createdAt` is today, `MMM D, h:mm A` otherwise.
- In-game date and region segments are omitted entirely when null.
- `Save as Group…` appears only when `set.npcs.length > 1`, and opens the
  existing `SaveBatchDialog` scoped to that set.
- `sticky top-0` with a solid background inside the scroll container.

### 9.5 Card layout per set

Each set independently chooses its layout using the existing rule —
`grid-cols-2` when that set has more than one NPC, `space-y-2` otherwise. A
1-NPC set and a 12-NPC set render differently in the same scroll.

### 9.6 Re-roll affordances

- Card header gains a ↻ next to `Save`. Disabled with a tooltip when
  `npc.recipe` is absent (hydrated pre-feature data).
- Each value line gains a ↻ revealed on row hover/focus
  (`opacity-0 group-hover:opacity-100 focus-visible:opacity-100`), so the dense
  10–12px layout stays clean at rest.
- A field whose recipe table is missing from `tableMap` renders its ↻ disabled
  with tooltip *"Source table no longer exists — can't re-roll"* (D12). Note that
  a table recategorized out of `NPC` is indistinguishable from a deleted one,
  because `useRandomTables(campaignId, "NPC")` filters by category — the message
  is deliberately worded to cover both.
- Gender (♂/♀) is **not** clickable.

### 9.7 Scroll container

`max-h-[60vh] min-h-96 max-h-[40rem] overflow-y-auto`, ref'd so `handleGenerate`
can set `scrollTop = 0`.

## 10. Save integration

- `handleSaveSingle(setId, index, npc)` → `saveSingleMutation` → on success
  `markSaved(campaignId, setId, index, created.id)`.
- `handleSaveBatch` becomes per-set and marks each saved NPC by its index within
  that set. This **replaces** the current object-identity matching at
  [NpcPanel.tsx:200](../src/components/npc/NpcPanel.tsx#L200)
  (`savedSet.has(n)`), which cannot work once NPCs are replaced by re-roll.
  → `useSaveBatchNpcs` must return the created ids in order for this to work; if
  it does not today, extend the batch route's response.
- Re-roll sets `savedNpcId: null`; the badge reverts to `Save`. The DB row is
  untouched, and re-saving creates a second record (D8).

## 11. Test plan

The repo has a vitest suite in `src/__tests__/` (19 files). **`CLAUDE.md`'s claim
that "There are no automated tests" is stale and should be corrected** as part of
this work.

New — `src/__tests__/npc-reroll.test.ts`:
- `generateNpc` attaches a recipe whose ids match the profile config and the
  resolved name table.
- `rerollNpc` preserves slot shape: same labels, same array lengths, same
  `typeLabel`.
- `rerollNpc` with `genderSelection: "male"` never yields female; with
  `"random"` it can yield either (seed `Math.random`).
- Type cascade: rolling a type that maps to a *different* name table re-rolls the
  name; a type that maps to the *same* table leaves the name intact.
- Missing table: remove a `physicalTableIds[0]` entry from `tableMap`; that value
  is preserved verbatim while every other field changes.
- `rerollNpc` uses `recipe.regionId`, not a passed-in current region — assert via
  an `AUTO_REGION` modifier that only fires for the original region.

New — `src/__tests__/npcHistoryStore.test.ts`:
- `pushSet` prepends and trims to retention.
- Lowering retention 25 → 5 trims immediately.
- Pinned sets survive trimming and do not count toward N.
- Eviction order: oldest unpinned first, pinned only as last resort.
- `clear(campaignId)` leaves other campaigns' history intact.

Extend `src/__tests__/calendar-engine.test.ts` with `formatCampaignDate`,
including the out-of-range-month fallback.

## 12. Files touched

**New**
- `src/types/npcHistory.ts`
- `src/stores/npcHistoryStore.ts`
- `src/components/npc/NpcCard.tsx`
- `src/components/npc/NpcResultSetView.tsx`
- `src/components/npc/NpcHistoryList.tsx`
- `src/__tests__/npc-reroll.test.ts`
- `src/__tests__/npcHistoryStore.test.ts`

**Modified**
- `src/types/npc.ts` — `NpcRecipe`, `NpcField`, `GeneratedNpc.recipe`/`.savedNpcId`
- `src/lib/npc/generator.ts` — recipe capture, `rerollNpc`, `rerollNpcField`
- `src/lib/calendar/engine.ts` — `formatCampaignDate`
- `src/components/calendar/CalendarPanel.tsx` — use the shared formatter
- `src/components/npc/NpcPanel.tsx` — history wiring, prop, button removal
- `src/components/layout/AppShell.tsx` — pass `currentDate`
- `src/app/api/saved-npc/batch/route.ts` + `src/hooks/useSavedNpcs.ts` — return
  created ids in order, if not already
- `src/__tests__/calendar-engine.test.ts`
- `CLAUDE.md` — correct the stale "no automated tests" line

**No Prisma / migration / API-route changes** beyond the batch-response tweak.

## 13. Sequencing

1. Types + `formatCampaignDate` (+ tests). Independent, no UI risk.
2. Generator: recipe capture, `rerollNpc`, `rerollNpcField` (+ tests). Recipe
   capture is purely additive — existing behavior is unchanged and shippable here.
3. Store + trimming + quota adapter (+ tests). Still not wired to UI.
4. Component extraction: move `NpcCard` out of `NpcPanel` with no behavior change.
5. Wire `NpcPanel` to the store; add `currentDate`; delete the "Re-roll" button.
6. Re-roll affordances and disabled states.
7. Housekeeping controls: retention, pin, dismiss, clear.

## 14. Open assumptions

Decided without asking; flag if any is wrong:

- Retention is a **global** preference (not per-campaign) — it describes you, not
  a campaign.
- Real-time format is absolute (`2:14 PM`), not relative (`3m ago`), with a date
  prefix once the set is not from today.
- Pinning is set-level only; there is no pinning of an individual NPC. (`isPinned`
  already exists on the *saved* NPC DB model and is a separate concept.)
- History is not cleared when a campaign is deleted — orphaned `byCampaign` keys
  linger in localStorage. Harmless; could be reaped on load against the known
  campaign list if it ever matters.
