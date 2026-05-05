-- AlterTable
ALTER TABLE "CampaignState" ADD COLUMN "todayWeatherJson" TEXT;

-- AlterTable
ALTER TABLE "RandomTable" ADD COLUMN "prerequisiteDice" TEXT;
ALTER TABLE "RandomTable" ADD COLUMN "prerequisiteMax" INTEGER;
ALTER TABLE "RandomTable" ADD COLUMN "prerequisiteMin" INTEGER;

-- CreateTable
CREATE TABLE "NpcAffiliation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NpcAffiliation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SavedNpc" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "affiliationId" TEXT,
    "name" TEXT,
    "gender" TEXT NOT NULL,
    "age" TEXT,
    "type" TEXT,
    "typeLabel" TEXT NOT NULL,
    "secondaryType" TEXT,
    "secondaryTypeLabel" TEXT,
    "physicalJson" TEXT NOT NULL DEFAULT '[]',
    "personalityJson" TEXT NOT NULL DEFAULT '[]',
    "detailsJson" TEXT NOT NULL DEFAULT '[]',
    "isDeceased" BOOLEAN NOT NULL DEFAULT false,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "isCombatant" BOOLEAN NOT NULL DEFAULT false,
    "combatAc" INTEGER,
    "combatHd" TEXT,
    "combatMaxHp" INTEGER,
    "combatAttackBonus" INTEGER,
    "combatAttackDamage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedNpc_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SavedNpc_affiliationId_fkey" FOREIGN KEY ("affiliationId") REFERENCES "NpcAffiliation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CombatEncounter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currentRound" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CombatEncounter_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CombatSide" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "encounterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "actedThisRound" BOOLEAN NOT NULL DEFAULT false,
    "isPlayerSide" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "CombatSide_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "CombatEncounter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CombatCombatant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sideId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "ac" INTEGER NOT NULL DEFAULT 9,
    "hd" TEXT NOT NULL DEFAULT '1d8',
    "maxHp" INTEGER NOT NULL DEFAULT 8,
    "currentHp" INTEGER NOT NULL DEFAULT 8,
    "attackBonus" INTEGER NOT NULL DEFAULT 0,
    "attackDamage" TEXT NOT NULL DEFAULT '1d6',
    "notes" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CombatCombatant_sideId_fkey" FOREIGN KEY ("sideId") REFERENCES "CombatSide" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "defaultSurpriseDice" TEXT,
    "defaultSurpriseThreshold" INTEGER,
    "defaultReactionTableId" TEXT,
    "defaultMoraleTableId" TEXT,
    "encounterWindowsJson" TEXT NOT NULL DEFAULT '[]',
    "defaultCombatAC" INTEGER,
    "defaultCombatHD" TEXT,
    "defaultCombatAttackBonus" INTEGER,
    "defaultCombatAttackDamage" TEXT,
    "defaultRollHpIndividually" BOOLEAN NOT NULL DEFAULT false,
    "defaultTraitTableId" TEXT,
    "defaultTraitCount" INTEGER,
    CONSTRAINT "Campaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Campaign" ("createdAt", "defaultReactionTableId", "defaultSurpriseDice", "defaultSurpriseThreshold", "encounterWindowsJson", "id", "name", "updatedAt", "userId") SELECT "createdAt", "defaultReactionTableId", "defaultSurpriseDice", "defaultSurpriseThreshold", "encounterWindowsJson", "id", "name", "updatedAt", "userId" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "NpcAffiliation_campaignId_idx" ON "NpcAffiliation"("campaignId");

-- CreateIndex
CREATE INDEX "SavedNpc_campaignId_createdAt_idx" ON "SavedNpc"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "SavedNpc_campaignId_name_idx" ON "SavedNpc"("campaignId", "name");

-- CreateIndex
CREATE INDEX "SavedNpc_campaignId_isPinned_idx" ON "SavedNpc"("campaignId", "isPinned");

-- CreateIndex
CREATE INDEX "SavedNpc_campaignId_isCombatant_idx" ON "SavedNpc"("campaignId", "isCombatant");

-- CreateIndex
CREATE INDEX "CombatEncounter_campaignId_isActive_idx" ON "CombatEncounter"("campaignId", "isActive");

