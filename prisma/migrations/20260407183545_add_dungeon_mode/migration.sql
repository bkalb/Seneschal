-- CreateTable
CREATE TABLE "DungeonConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "turnsPerHour" INTEGER NOT NULL DEFAULT 6,
    "encounterTurnsJson" TEXT NOT NULL DEFAULT '[2,5]',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DungeonConfig_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LightSourceType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultDuration" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LightSourceType_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActiveLightSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "typeId" TEXT,
    "name" TEXT NOT NULL,
    "carrierName" TEXT NOT NULL,
    "remainingTurns" INTEGER NOT NULL,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ActiveLightSource_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActiveLightSource_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "LightSourceType" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CampaignState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "currentRegionId" TEXT,
    "currentDate" TEXT NOT NULL DEFAULT '0001-01-01',
    "mode" TEXT NOT NULL DEFAULT 'OVERLAND',
    "currentTime" TEXT NOT NULL DEFAULT '12:00 PM',
    "currentDungeonRegionId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CampaignState_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CampaignState_currentRegionId_fkey" FOREIGN KEY ("currentRegionId") REFERENCES "Region" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CampaignState" ("campaignId", "currentDate", "currentRegionId", "id", "updatedAt") SELECT "campaignId", "currentDate", "currentRegionId", "id", "updatedAt" FROM "CampaignState";
DROP TABLE "CampaignState";
ALTER TABLE "new_CampaignState" RENAME TO "CampaignState";
CREATE UNIQUE INDEX "CampaignState_campaignId_key" ON "CampaignState"("campaignId");
CREATE TABLE "new_RandomTable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'ENCOUNTER',
    "diceExpression" TEXT NOT NULL,
    "isStateful" BOOLEAN NOT NULL DEFAULT false,
    "lastResult" INTEGER,
    "lastModifiedResult" INTEGER,
    "rollOnDayAdvance" BOOLEAN NOT NULL DEFAULT false,
    "seasonName" TEXT,
    "rollWhenNoSeason" TEXT NOT NULL DEFAULT 'always',
    "manualModifier" INTEGER NOT NULL DEFAULT 0,
    "surpriseDice" TEXT,
    "surpriseThreshold" INTEGER,
    "npcForType" TEXT,
    "npcForGender" TEXT,
    "applicableModes" TEXT NOT NULL DEFAULT 'BOTH',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RandomTable_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RandomTable" ("campaignId", "category", "createdAt", "diceExpression", "id", "isStateful", "lastModifiedResult", "lastResult", "manualModifier", "name", "npcForGender", "npcForType", "rollOnDayAdvance", "rollWhenNoSeason", "seasonName", "sortOrder", "surpriseDice", "surpriseThreshold", "updatedAt") SELECT "campaignId", "category", "createdAt", "diceExpression", "id", "isStateful", "lastModifiedResult", "lastResult", "manualModifier", "name", "npcForGender", "npcForType", "rollOnDayAdvance", "rollWhenNoSeason", "seasonName", "sortOrder", "surpriseDice", "surpriseThreshold", "updatedAt" FROM "RandomTable";
DROP TABLE "RandomTable";
ALTER TABLE "new_RandomTable" RENAME TO "RandomTable";
CREATE TABLE "new_Region" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rerollOnSwitch" BOOLEAN NOT NULL DEFAULT false,
    "regionType" TEXT NOT NULL DEFAULT 'OVERLAND',
    CONSTRAINT "Region_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Region" ("campaignId", "id", "name", "rerollOnSwitch") SELECT "campaignId", "id", "name", "rerollOnSwitch" FROM "Region";
DROP TABLE "Region";
ALTER TABLE "new_Region" RENAME TO "Region";
CREATE TABLE "new_RulesSection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "applicableModes" TEXT NOT NULL DEFAULT 'BOTH',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RulesSection_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RulesSection" ("campaignId", "content", "createdAt", "id", "sortOrder", "title", "updatedAt") SELECT "campaignId", "content", "createdAt", "id", "sortOrder", "title", "updatedAt" FROM "RulesSection";
DROP TABLE "RulesSection";
ALTER TABLE "new_RulesSection" RENAME TO "RulesSection";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "DungeonConfig_campaignId_key" ON "DungeonConfig"("campaignId");
