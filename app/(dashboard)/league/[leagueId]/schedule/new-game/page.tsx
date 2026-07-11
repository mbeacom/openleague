import GroupsIcon from "@mui/icons-material/Groups";
import { notFound } from "next/navigation";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import InterTeamGameForm from "@/components/features/events/InterTeamGameForm";
import { getNewLeagueGameContext } from "@/lib/actions/league-context";

interface NewGamePageProps {
  params: Promise<{ leagueId: string }>;
}

export default async function NewGamePage({ params }: NewGamePageProps) {
  const { leagueId } = await params;

  const data = await getNewLeagueGameContext(leagueId);

  if (!data) {
    notFound();
  }

  if (data.teams.length < 2) {
    return (
      <PageContainer maxWidth="md">
        <PageHeader title="Schedule Inter-Team Game" />
        <EmptyState
          icon={<GroupsIcon />}
          title="Not enough teams"
          description="You need at least 2 teams in the league to schedule inter-team games."
          action={
            <LinkButton href={`/league/${leagueId}/teams/new`} variant="contained">
              Add a team
            </LinkButton>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="md">
      <PageHeader
        title="Schedule Inter-Team Game"
        subtitle={`${data.league.name} • Create a game between two teams`}
      />

      <InterTeamGameForm
        leagueId={leagueId}
        teams={data.teams}
      />
    </PageContainer>
  );
}
