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
    "encounterWindowsJson" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "Campaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Campaign" ("createdAt", "defaultReactionTableId", "defaultSurpriseDice", "defaultSurpriseThreshold", "id", "name", "updatedAt", "userId") SELECT "createdAt", "defaultReactionTableId", "defaultSurpriseDice", "defaultSurpriseThreshold", "id", "name", "updatedAt", "userId" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
