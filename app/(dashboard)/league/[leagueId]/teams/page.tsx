import { requireUserId } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import { hasLeagueAccess, getLeagueTeamsWithDivisions } from "@/lib/actions/league";
import LeagueTeamsView from "@/components/features/team/LeagueTeamsView";

interface LeagueTeamsPageProps {
  params: Promise<{
    leagueId: string;
  }>;
}

export default async function LeagueTeamsPage({ params }: LeagueTeamsPageProps) {
  const [userId, { leagueId }] = await Promise.all([
    requireUserId(),
    params,
  ]);

  // Verify user has access to this league
  const hasAccess = await hasLeagueAccess(userId, leagueId);
  if (!hasAccess) {
    notFound();
  }

  // Get league teams with divisions
  const leagueData = await getLeagueTeamsWithDivisions(leagueId);
  if (!leagueData) {
    notFound();
  }

  return <LeagueTeamsView league={leagueData} />;
}