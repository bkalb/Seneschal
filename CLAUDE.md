# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important: Next.js Version Warning

This project uses **Next.js 16.2.2**, which may have breaking changes from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

**Database:**
```bash
npx prisma migrate dev   # Apply migrations (dev)
npx prisma db push       # Push schema changes without migration
npx prisma generate      # Regenerate Prisma client (always run after schema changes)
npx prisma studio        # Open Prisma Studio UI
```

**Important:** After any change to `prisma/schema.prisma`, always run `npx prisma generate` to regenerate the Prisma client. `db push` / `migrate dev` sync the database but do not update the generated client types — skipping this causes runtime "Unknown argument" errors.

There are no automated tests — this is a local-first tool.

## Architecture Overview

**Seneschal** is a Next.js 16 App Router application for tabletop RPG game masters. It uses SQLite (via Prisma) and is designed for local network use, not public deployment.

### Multi-Tenant Campaign Model

All data is scoped to a `Campaign`, which belongs to a `User`. The hierarchy is:

```
User → Campaign → (RulesSections, RandomTables, Regions, CalendarConfig, NpcProfiles, Flags, DungeonConfig, ActiveLightSources)
```

`CampaignState` is a 1:1 with Campaign and tracks current mode (`OVERLAND`/`DUNGEON`), region, in-game date, and in-dungeon time.

### Mode System (OVERLAND / DUNGEON)

Campaigns toggle between two exploration modes. Rules sections, random tables, and regions each have an `applicableModes` field (`OVERLAND | DUNGEON | BOTH`) and UI filters content accordingly.

### Random Table Engine (`src/lib/tables/`)

The core logic lives here:
- `engine.ts` — resolves a roll against table rows, applies modifiers
- `modifier-resolver.ts` — determines which `TableModifier`s are active (ALWAYS / AUTO_REGION / CONDITIONAL_REGION)
- `encounter-roll.ts` — orchestrates an encounter roll including surprise and reaction sub-rolls
- `sub-roll.ts` — handles nested dice notation in outcomes (e.g., "2d6 Bandits")
- `import/` — parser chain for CSV, markdown, and plaintext table imports

`TableModifier` behaviors:
- `ALWAYS` — always shown as a user toggle
- `AUTO_REGION` — fires automatically when current region matches
- `CONDITIONAL_REGION` — shown as toggle only when current region matches

### Calendar Engine (`src/lib/calendar/`)

Fully custom campaign calendars: variable month lengths, custom weekdays, named seasons with date ranges, intercalary days (outside the weekly structure), and multiple moons with independent phase cycles. Dates are stored as `"YYYY-MM-DD"` strings using the campaign's own calendar (not Gregorian). Day advancement can auto-roll CALENDAR-category tables (weather, etc.).

### Dungeon Time Tracking

Turn-based time tracking configured via `DungeonConfig` (turns per hour, which turns trigger encounter checks). `ActiveLightSource` records track remaining turns for each lit light source and tick down on turn advance. Current dungeon time is stored as a `"HH:MM AM/PM"` string in `CampaignState`.

### Data Layer

- **ORM**: Prisma with SQLite adapter (`src/lib/prisma.ts` — singleton client)
- **Auth**: better-auth (`src/lib/auth.ts`) — email/password, 30-day sessions
- **API routes**: `src/app/api/` — one directory per resource, standard Next.js route handlers
- **Client state**: Zustand (`src/stores/`) for ephemeral UI (roll history capped at 20, panel collapse state)
- **Server state**: TanStack React Query via custom hooks in `src/hooks/`

### JSON Fields in Schema

Several complex configurations are stored as JSON strings in SQLite columns:
- `CalendarConfig`: `monthsJson`, `weekdaysJson`, `seasonsJson`, `intercalaryJson`
- `Campaign`: `encounterWindowsJson` (named time windows for encounter timing)
- `DungeonConfig`: `encounterTurnsJson` (which turns trigger checks, 1-indexed within each hour)
- `NpcProfile`: `stepsJson` (ordered roll step sequence)
- `TableModifier`: `extraConfig` (non-additive effects like `{ type: "multiply_chance", factor: 2 }`)

### Rich Text

Rules sections and calendar notes use TipTap (JSON stored in DB, rendered to HTML). The editor supports paragraphs, lists, tables, and links.

### NPC Generator

Each campaign has multiple named `NpcProfile`s (e.g., "Random NPC", "Ergyng NPC"). Each profile contains an ordered sequence of roll steps (`stepsJson`) that may reference NPC-category tables. Name tables can be tagged with `npcForType` and `npcForGender` for auto-selection.

## Key Paths

| Path | Purpose |
|------|---------|
| `src/app/api/` | All API route handlers |
| `src/components/layout/AppShell.tsx` | Root dashboard layout |
| `src/lib/tables/engine.ts` | Core table rolling logic |
| `src/lib/calendar/engine.ts` | Calendar date math & moon phases |
| `src/lib/auth.ts` | better-auth configuration |
| `src/lib/prisma.ts` | Prisma singleton |
| `src/hooks/` | TanStack Query hooks (one per resource) |
| `src/stores/` | Zustand stores |
| `prisma/schema.prisma` | Full data model |
| `@/*` | Path alias for `./src/*` |

## Environment

Required `.env` variables:
- `DATABASE_URL` — SQLite file path (e.g., `file:./dev.db`)
- `BETTER_AUTH_SECRET` — secret for session signing
- `BETTER_AUTH_URL` — base URL for auth callbacks
