-- Add forecastingMode to CampaignState
ALTER TABLE "CampaignState" ADD COLUMN "forecastingMode" BOOLEAN NOT NULL DEFAULT false;

-- Add forecast columns to RandomTable
ALTER TABLE "RandomTable" ADD COLUMN "forecastResult" INTEGER;
ALTER TABLE "RandomTable" ADD COLUMN "forecastModifiedResult" INTEGER;
ALTER TABLE "RandomTable" ADD COLUMN "forecastDate" TEXT;
ALTER TABLE "RandomTable" ADD COLUMN "forecastOutcome" TEXT;
