import { requireAuth, requireUserId } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import { hasLeagueAccess, getLeagueDivisions } from "@/lib/actions/league";
import CreateLeagueTeamForm from "@/components/features/team/CreateLeagueTeamForm";

interface CreateTeamPageProps {
  params: {
    leagueId: string;
  };
  searchParams: {
    divisionId?: string;
  };
}

export default async function CreateTeamPage({ params, searchParams }: CreateTeamPageProps) {
  await requireAuth();
  const userId = await requireUserId();

  // Verify user has access to this league
  const hasAccess = await hasLeagueAccess(userId, params.leagueId);
  if (!hasAccess) {
    notFound();
  }

  // Get league divisions for the form
  const divisions = await getLeagueDivisions(params.leagueId);

  return (
    <CreateLeagueTeamForm 
      leagueId={params.leagueId} 
      divisions={divisions}
      preselectedDivisionId={searchParams.divisionId}
    />
  );
}