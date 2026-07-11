import { notFound } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import LeagueInvitationManager from "@/components/features/roster/LeagueInvitationManager";
import { getLeagueInvitationsData } from "@/lib/actions/league-context";

interface LeagueInvitationsPageProps {
  params: Promise<{ leagueId: string }>;
}

export default async function LeagueInvitationsPage({ params }: LeagueInvitationsPageProps) {
  const { leagueId } = await params;

  const data = await getLeagueInvitationsData(leagueId);
  if (!data) {
    notFound();
  }

  return (
    <PageContainer>
      <PageHeader title="Invitations" subtitle={data.league.name} />

      <LeagueInvitationManager
        teams={data.teams}
        invitations={data.invitations}
        leagueId={leagueId}
        isLeagueAdmin={data.isLeagueAdmin}
      />
    </PageContainer>
  );
}
