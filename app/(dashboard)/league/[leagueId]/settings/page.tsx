import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUserId, getUserLeagueRole } from "@/lib/auth/session";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import LeagueSettingsForm from "./LeagueSettingsForm";

interface LeagueSettingsPageProps {
  params: Promise<{
    leagueId: string;
  }>;
}

/**
 * League profile settings (roadmap D1). LEAGUE_ADMIN only — other members get
 * a 404 rather than a read-only view of admin contact details.
 */
export default async function LeagueSettingsPage({ params }: LeagueSettingsPageProps) {
  const [userId, { leagueId }] = await Promise.all([requireUserId(), params]);

  const role = await getUserLeagueRole(userId, leagueId);
  if (role !== "LEAGUE_ADMIN") {
    notFound();
  }

  const league = await prisma.league.findFirst({
    where: { id: leagueId, isActive: true },
    select: {
      id: true,
      name: true,
      sport: true,
      contactEmail: true,
      contactPhone: true,
    },
  });

  if (!league) {
    notFound();
  }

  return (
    <PageContainer maxWidth="md">
      <PageHeader
        title="League Settings"
        subtitle={`Update ${league.name}'s profile and contact details.`}
      />
      <LeagueSettingsForm league={league} />
    </PageContainer>
  );
}
