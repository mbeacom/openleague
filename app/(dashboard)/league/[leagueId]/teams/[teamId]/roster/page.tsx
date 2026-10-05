import { notFound, redirect } from "next/navigation";
import { canAccessActiveTeamInLeague } from "@/lib/auth/team-access";

interface LeagueTeamRosterRedirectPageProps {
  params: Promise<{ leagueId: string; teamId: string }>;
}

export default async function LeagueTeamRosterRedirectPage({ params }: LeagueTeamRosterRedirectPageProps) {
  const { leagueId, teamId } = await params;

  if (!(await canAccessActiveTeamInLeague(teamId, leagueId))) {
    notFound();
  }

  redirect(`/team/${teamId}/roster`);
}