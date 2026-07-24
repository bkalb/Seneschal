-- Backfill: `attackCount` was added to schema.prisma + application code in
-- commit d916eca ("feat: combat UI improvements and attackCount field") and
-- synced to local dev.db via `prisma db push`, but never captured in a
-- migration. This migration records that column so `migrate deploy` produces
-- the correct schema on a fresh/production database.
ALTER TABLE "CombatCombatant" ADD COLUMN "attackCount" INTEGER NOT NULL DEFAULT 1;
