-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" DATETIME,
    "refreshTokenExpiresAt" DATETIME,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Campaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CampaignState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "currentRegionId" TEXT,
    "currentDate" TEXT NOT NULL DEFAULT '0001-01-01',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CampaignState_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CampaignState_currentRegionId_fkey" FOREIGN KEY ("currentRegionId") REFERENCES "Region" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Region_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RulesSection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RulesSection_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RandomTable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "diceExpression" TEXT NOT NULL,
    "isStateful" BOOLEAN NOT NULL DEFAULT false,
    "lastResult" INTEGER,
    "rollOnDayAdvance" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RandomTable_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RandomTableRegion" (
    "tableId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,

    PRIMARY KEY ("tableId", "regionId"),
    CONSTRAINT "RandomTableRegion_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "RandomTable" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RandomTableRegion_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TableRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tableId" TEXT NOT NULL,
    "min" INTEGER NOT NULL,
    "max" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    CONSTRAINT "TableRow_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "RandomTable" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TableModifier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tableId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "behavior" TEXT NOT NULL,
    "rollAdjustment" INTEGER NOT NULL DEFAULT 0,
    "extraConfig" TEXT,
    CONSTRAINT "TableModifier_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "RandomTable" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalendarConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "monthsJson" TEXT NOT NULL,
    "weekdaysJson" TEXT NOT NULL,
    "seasonsJson" TEXT NOT NULL,
    "intercalaryJson" TEXT,
    "epochDate" TEXT NOT NULL DEFAULT '0001-01-01',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CalendarConfig_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Moon" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cycleLength" INTEGER NOT NULL,
    "referenceNewMoon" TEXT NOT NULL,
    CONSTRAINT "Moon_configId_fkey" FOREIGN KEY ("configId") REFERENCES "CalendarConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalendarNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CalendarNote_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ModifierAutoRegions" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ModifierAutoRegions_A_fkey" FOREIGN KEY ("A") REFERENCES "Region" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ModifierAutoRegions_B_fkey" FOREIGN KEY ("B") REFERENCES "TableModifier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ModifierConditionalRegions" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ModifierConditionalRegions_A_fkey" FOREIGN KEY ("A") REFERENCES "Region" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ModifierConditionalRegions_B_fkey" FOREIGN KEY ("B") REFERENCES "TableModifier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignState_campaignId_key" ON "CampaignState"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarConfig_campaignId_key" ON "CalendarConfig"("campaignId");

-- CreateIndex
CREATE INDEX "CalendarNote_campaignId_date_idx" ON "CalendarNote"("campaignId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "_ModifierAutoRegions_AB_unique" ON "_ModifierAutoRegions"("A", "B");

-- CreateIndex
CREATE INDEX "_ModifierAutoRegions_B_index" ON "_ModifierAutoRegions"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ModifierConditionalRegions_AB_unique" ON "_ModifierConditionalRegions"("A", "B");

-- CreateIndex
CREATE INDEX "_ModifierConditionalRegions_B_index" ON "_ModifierConditionalRegions"("B");
