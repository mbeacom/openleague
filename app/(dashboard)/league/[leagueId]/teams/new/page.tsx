import { requireAuth, requireUserId } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import { hasLeagueAccess, getLeagueDivisions } from "@/lib/actions/league";
import CreateLeagueTeamForm from "@/components/features/team/CreateLeagueTeamForm";

interface CreateTeamPageProps {
  params: Promise<{
    leagueId: string;
  }>;
  searchParams: Promise<{
    divisionId?: string;
  }>;
}

export default async function CreateTeamPage({ params, searchParams }: CreateTeamPageProps) {
  await requireAuth();
  const userId = await requireUserId();
  
  // Await params and searchParams (Next.js 15+)
  const { leagueId } = await params;
  const { divisionId } = await searchParams;

  // Verify user has access to this league
  const hasAccess = await hasLeagueAccess(userId, leagueId);
  if (!hasAccess) {
    notFound();
  }

  // Get league divisions for the form
  const divisions = await getLeagueDivisions(leagueId);

  return (
    <CreateLeagueTeamForm 
      leagueId={leagueId} 
      divisions={divisions}
      preselectedDivisionId={divisionId}
    />
  );
}