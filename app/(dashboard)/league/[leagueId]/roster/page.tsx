import { Divider } from "@mui/material";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import LeagueRosterView from "@/components/features/roster/LeagueRosterView";
import LeagueInvitationManager from "@/components/features/roster/LeagueInvitationManager";
import { getLeagueRosterData } from "@/lib/actions/league-context";

interface LeagueRosterPageProps {
  params: Promise<{ leagueId: string }>;
}

export default async function LeagueRosterPage({ params }: LeagueRosterPageProps) {
  const { leagueId } = await params;

  const data = await getLeagueRosterData(leagueId);
  if (!data) {
    notFound();
  }

  return (
    <PageContainer>
      <PageHeader title="League Roster" subtitle={data.league.name} />

      {data.isLeagueAdmin && (
        <>
          <LeagueInvitationManager
            teams={data.teams}
            invitations={data.invitations}
            leagueId={leagueId}
            isLeagueAdmin={data.isLeagueAdmin}
          />
          <Divider sx={{ my: 4 }} />
        </>
      )}

      <LeagueRosterView
        players={data.players}
        teams={data.teams}
        divisions={data.divisions}
        leagueId={leagueId}
        isLeagueAdmin={data.isLeagueAdmin}
      />
    </PageContainer>
  );
}
