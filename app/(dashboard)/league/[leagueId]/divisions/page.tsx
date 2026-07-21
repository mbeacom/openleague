import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUserId, getUserLeagueRole } from "@/lib/auth/session";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import DivisionManager from "@/components/features/team/DivisionManager";

interface LeagueDivisionsPageProps {
  params: Promise<{
    leagueId: string;
  }>;
}

/**
 * League division management. Any league member can view (the dashboard and
 * teams views surface division links to all members); create/edit/delete are
 * gated to LEAGUE_ADMIN both here (canManage) and in the server actions.
 */
export default async function LeagueDivisionsPage({ params }: LeagueDivisionsPageProps) {
  const [userId, { leagueId }] = await Promise.all([requireUserId(), params]);

  const role = await getUserLeagueRole(userId, leagueId);
  if (!role) {
    notFound();
  }

  const league = await prisma.league.findFirst({
    where: { id: leagueId, isActive: true },
    select: { id: true, name: true },
  });

  if (!league) {
    notFound();
  }

  const divisions = await prisma.division.findMany({
    where: { leagueId, isActive: true },
    select: {
      id: true,
      name: true,
      ageGroup: true,
      ageClassification: true,
      skillLevel: true,
      _count: {
        select: { teams: { where: { isActive: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <PageContainer>
      <PageHeader
        title="Divisions"
        subtitle={`Organize ${league.name} teams by age group and skill level.`}
      />
      <DivisionManager
        divisions={divisions}
        leagueId={leagueId}
        canManage={role === "LEAGUE_ADMIN"}
      />
    </PageContainer>
  );
}
