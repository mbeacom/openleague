import { notFound } from "next/navigation";
import {
  Card,
  CardContent,
  Chip,
  Container,
  Stack,
  Typography,
} from "@mui/material";
import { LinkCardActionArea } from "@/components/ui/NextLinkComposites";
import { prisma } from "@/lib/db/prisma";
import { listPublicSignupEvents } from "@/lib/actions/signup-events";
import { AGE_CLASSIFICATION_LABELS } from "@/lib/utils/age-level";
import { formatDateTime } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

/**
 * Public event rollup for a league/association (research R9). The slug is
 * minted when the league publishes its first PUBLIC signup event.
 */
export default async function AssociationEventsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const league = await prisma.league.findUnique({
    where: { slug },
    select: { id: true, name: true, isActive: true },
  });
  if (!league || !league.isActive) {
    notFound();
  }

  const events = await listPublicSignupEvents({ hostLeagueId: league.id });

  return (
    <Container maxWidth="md">
      <Stack spacing={3} sx={{ py: { xs: 4, md: 6 } }}>
        <Stack spacing={1}>
          <Typography variant="h3" component="h1">
            {league.name}
          </Typography>
          <Typography color="text.secondary">Upcoming signup events</Typography>
        </Stack>

        {events.length === 0 ? (
          <Typography color="text.secondary">No public events right now — check back soon.</Typography>
        ) : (
          <Stack spacing={2}>
            {events.map((event) => (
              <Card key={event.id}>
                <LinkCardActionArea href={`/signups/${event.id}`}>
                  <CardContent>
                    <Stack spacing={0.5}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography variant="h6">{event.title}</Typography>
                        {event.status === "CANCELED" ? (
                          <Chip size="small" color="error" label="Canceled" />
                        ) : null}
                        <Chip
                          size="small"
                          variant="outlined"
                          label={AGE_CLASSIFICATION_LABELS[event.ageClassification]}
                        />
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {formatDateTime(event.startAt, event.timezone)} ·{" "}
                        {event.venue?.name ?? event.locationText ?? "Location TBD"}
                      </Typography>
                    </Stack>
                  </CardContent>
                </LinkCardActionArea>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
