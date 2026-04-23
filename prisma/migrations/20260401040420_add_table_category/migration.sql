-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RandomTable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'ENCOUNTER',
    "diceExpression" TEXT NOT NULL,
    "isStateful" BOOLEAN NOT NULL DEFAULT false,
    "lastResult" INTEGER,
    "rollOnDayAdvance" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RandomTable_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RandomTable" ("campaignId", "createdAt", "diceExpression", "id", "isStateful", "lastResult", "name", "rollOnDayAdvance", "sortOrder", "updatedAt") SELECT "campaignId", "createdAt", "diceExpression", "id", "isStateful", "lastResult", "name", "rollOnDayAdvance", "sortOrder", "updatedAt" FROM "RandomTable";
DROP TABLE "RandomTable";
ALTER TABLE "new_RandomTable" RENAME TO "RandomTable";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
