import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

const moonSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  cycleLength: z.number().int().min(1),
  referenceNewMoon: z.string(),
});

const configSchema = z.object({
  campaignId: z.string(),
  epochDate: z.string().default("0001-01-01"),
  monthsJson: z.string(),       // JSON: { name, days }[]
  weekdaysJson: z.string(),     // JSON: string[]
  seasonsJson: z.string(),      // JSON: { name, startMonth, startDay, endMonth, endDay }[]
  intercalaryJson: z.string().nullable().optional(),
  moons: z.array(moonSchema).default([]),
});

function normalizeConfig(config: any) {
  return {
    id: config.id,
    campaignId: config.campaignId,
    epochDate: config.epochDate,
    months: JSON.parse(config.monthsJson),
    weekdays: JSON.parse(config.weekdaysJson),
    seasons: JSON.parse(config.seasonsJson),
    intercalary: config.intercalaryJson ? JSON.parse(config.intercalaryJson) : [],
    moons: config.moons.map((m: any) => ({
      id: m.id,
      name: m.name,
      cycleLength: m.cycleLength,
      referenceNewMoon: m.referenceNewMoon,
    })),
  };
}

export async function GET(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaignId = request.nextUrl.searchParams.get("campaignId");
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const config = await prisma.calendarConfig.findUnique({
    where: { campaignId },
    include: { moons: true },
  });

  if (!config) return NextResponse.json(null);
  return NextResponse.json(normalizeConfig(config));
}

export async function PATCH(request: NextRequest) {
  const { userId } = await requireSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = configSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { campaignId, moons, ...configData } = parsed.data;

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const config = await tx.calendarConfig.upsert({
      where: { campaignId },
      create: { campaignId, ...configData },
      update: configData,
    });

    // Replace moons entirely
    await tx.moon.deleteMany({ where: { configId: config.id } });
    await tx.moon.createMany({
      data: moons.map((m) => ({
        configId: config.id,
        name: m.name,
        cycleLength: m.cycleLength,
        referenceNewMoon: m.referenceNewMoon,
      })),
    });

    return tx.calendarConfig.findUnique({
      where: { id: config.id },
      include: { moons: true },
    });
  }, { timeout: 30000 });

  return NextResponse.json(normalizeConfig(updated));
}
