/*
  Warnings:

  - Added the required column `name` to the `NpcProfile` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NpcProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stepsJson" TEXT NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NpcProfile_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NpcProfile" ("campaignId", "id", "name", "stepsJson", "sortOrder", "updatedAt") SELECT "campaignId", "id", 'Default', "stepsJson", 0, "updatedAt" FROM "NpcProfile";
DROP TABLE "NpcProfile";
ALTER TABLE "new_NpcProfile" RENAME TO "NpcProfile";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
