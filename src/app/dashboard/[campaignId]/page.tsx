import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import AppShell from "@/components/layout/AppShell";

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const { campaignId } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      state: { include: { currentRegion: true } },
      regions: { orderBy: { name: "asc" } },
    },
  });

  // Ensure CampaignState exists (upsert default if missing)
  if (campaign && !campaign.state) {
    await prisma.campaignState.upsert({
      where: { campaignId },
      update: {},
      create: { campaignId },
    });
  }

  const rawFlags = campaign
    ? await prisma.campaignFlag.findMany({
        where: { campaignId },
        orderBy: { sortOrder: "asc" },
      })
    : [];
  const initialFlags = rawFlags.map((f) => ({
    ...f,
    countDirection: f.countDirection as "up" | "down" | null,
  }));

  if (!campaign || campaign.userId !== session.user.id) {
    redirect("/dashboard");
  }

  const allCampaigns = await prisma.campaign.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  return (
    <AppShell
      campaign={campaign}
      allCampaigns={allCampaigns}
      userId={session.user.id}
      initialFlags={initialFlags}
    />
  );
}
