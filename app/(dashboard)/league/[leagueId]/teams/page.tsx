import { requireAuth, requireUserId } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import { hasLeagueAccess, getLeagueTeamsWithDivisions } from "@/lib/actions/league";
import LeagueTeamsView from "@/components/features/team/LeagueTeamsView";

interface LeagueTeamsPageProps {
  params: {
    leagueId: string;
  };
}

export default async function LeagueTeamsPage({ params }: LeagueTeamsPageProps) {
  await requireAuth();
  const userId = await requireUserId();

  // Verify user has access to this league
  const hasAccess = await hasLeagueAccess(userId, params.leagueId);
  if (!hasAccess) {
    notFound();
  }

  // Get league teams with divisions
  const leagueData = await getLeagueTeamsWithDivisions(params.leagueId);
  if (!leagueData) {
    notFound();
  }

  return <LeagueTeamsView league={leagueData} />;
}