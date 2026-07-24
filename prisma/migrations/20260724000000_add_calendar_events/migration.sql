-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "recurrence" TEXT NOT NULL DEFAULT 'ONCE',
    "anchorDate" TEXT NOT NULL,
    "endDate" TEXT,
    "moonId" TEXT,
    "moonPhase" TEXT,
    "color" TEXT NOT NULL DEFAULT '#93c5fd',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CalendarEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CalendarEvent_moonId_fkey" FOREIGN KEY ("moonId") REFERENCES "Moon" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CalendarEvent_campaignId_idx" ON "CalendarEvent"("campaignId");
