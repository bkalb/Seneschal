import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import NoCampaigns from "@/components/layout/NoCampaigns";

export default async function DashboardIndexPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const firstCampaign = await prisma.campaign.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });

  if (firstCampaign) {
    redirect(`/dashboard/${firstCampaign.id}`);
  }

  return <NoCampaigns />;
}
