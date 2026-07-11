import { Add } from "@mui/icons-material";
import { notFound } from "next/navigation";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import LeagueCalendar from "@/components/features/calendar/LeagueCalendar";
import { getLeagueScheduleData } from "@/lib/actions/league-context";
import { formatSport } from "@/lib/utils/validation";

interface LeagueSchedulePageProps {
  params: Promise<{ leagueId: string }>;
}

export default async function LeagueSchedulePage({ params }: LeagueSchedulePageProps) {
  const { leagueId } = await params;

  const data = await getLeagueScheduleData(leagueId);
  if (!data) {
    notFound();
  }

  return (
    <PageContainer>
      <PageHeader
        title="League Schedule"
        subtitle={`${data.league.name} • ${formatSport(data.league.sport)}`}
        actions={
          data.canCreateGames ? (
            <LinkButton
              href={`/league/${leagueId}/schedule/new-game`}
              variant="contained"
              startIcon={<Add />}
            >
              Schedule Game
            </LinkButton>
          ) : undefined
        }
      />

      <LeagueCalendar
        events={data.events}
        teams={data.teams}
        divisions={data.divisions}
        leagueId={leagueId}
        leagueName={data.league.name}
      />
    </PageContainer>
  );
}
