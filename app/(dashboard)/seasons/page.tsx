import AddIcon from "@mui/icons-material/Add";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { getSeasons } from "@/lib/actions/seasons";
import { SeasonList, type SeasonListItem } from "@/components/features/seasons/SeasonList";

export const dynamic = "force-dynamic";

export default async function SeasonsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const showArchived = archived === "1";
  const seasons = await getSeasons({ includeArchived: showArchived });

  const items: SeasonListItem[] = seasons.map((season) => ({
    id: season.id,
    name: season.name,
    startDate: season.startDate,
    endDate: season.endDate,
    archivedAt: season.archivedAt,
    format: season.format,
    formatRounds: season.formatRounds,
    ownerName: season.league?.name ?? season.team?.name ?? "",
    gameCount: season._count.games,
  }));

  return (
    <PageContainer maxWidth="md">
      <PageHeader
        title="Seasons"
        actions={
          <>
            <LinkButton href="/seasons/proposals" sx={{ minHeight: 44 }}>
              Game proposals
            </LinkButton>
            <LinkButton
              href="/seasons/new"
              variant="contained"
              startIcon={<AddIcon />}
              sx={{ minHeight: 44 }}
            >
              New season
            </LinkButton>
          </>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<CalendarMonthIcon />}
          title="No seasons yet"
          description="Create one with just a name and dates — no format or rotation scheme required — then schedule games one at a time. Each game lands on both teams' calendars with RSVP requests."
          action={
            <LinkButton href="/seasons/new" variant="contained" startIcon={<AddIcon />}>
              New season
            </LinkButton>
          }
        />
      ) : null}

      <SeasonList seasons={items} showArchived={showArchived} />
    </PageContainer>
  );
}
