import Link from "next/link";
import { Button, Container, Stack, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
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
    <Container maxWidth="md">
      <Stack spacing={3} sx={{ py: { xs: 3, md: 5 } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h4" component="h1">
            Seasons
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button component={Link} href="/seasons/proposals" sx={{ minHeight: 44 }}>
              Game proposals
            </Button>
            <Button
              component={Link}
              href="/seasons/new"
              variant="contained"
              startIcon={<AddIcon />}
              sx={{ minHeight: 44 }}
            >
              New season
            </Button>
          </Stack>
        </Stack>

        {items.length === 0 ? (
          <Typography color="text.secondary">
            No seasons yet. Create one with just a name and dates — no format or rotation scheme
            required — then schedule games one at a time. Each game lands on both teams&apos;
            calendars with RSVP requests.
          </Typography>
        ) : null}

        <SeasonList seasons={items} showArchived={showArchived} />
      </Stack>
    </Container>
  );
}
