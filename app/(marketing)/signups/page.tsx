import type { Metadata } from "next";
import {
  Card,
  CardContent,
  Chip,
  Container,
  Stack,
  Typography,
} from "@mui/material";
import { LinkCardActionArea } from "@/components/ui/NextLinkComposites";
import { listPublicSignupEvents } from "@/lib/actions/signup-events";
import { AGE_CLASSIFICATION_LABELS } from "@/lib/utils/age-level";
import { formatDateTime } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Events | OpenLeague",
  description: "Upcoming signup events from local rinks, associations, and teams.",
};

export default async function PublicEventsPage() {
  const events = await listPublicSignupEvents();

  return (
    <Container maxWidth="md">
      <Stack spacing={3} sx={{ py: { xs: 4, md: 6 } }}>
        <Stack spacing={1}>
          <Typography variant="h3" component="h1">
            Upcoming events
          </Typography>
          <Typography color="text.secondary">
            Signup events hosted by local rinks, associations, and teams — clinics, scrimmage
            nights, tryouts, tournaments, and more.
          </Typography>
        </Stack>

        {events.length === 0 ? (
          <Typography color="text.secondary">No public events right now — check back soon.</Typography>
        ) : (
          <Stack spacing={2}>
            {events.map((event) => {
              const hostName =
                event.hostOrganization?.name ?? event.hostLeague?.name ?? event.hostTeam?.name ?? "";
              return (
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
                          {event.venue?.name ?? event.locationText ?? "Location TBD"} · {hostName}
                        </Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          {event.slots.slice(0, 4).map((slot) => (
                            <Chip key={slot.id} size="small" variant="outlined" label={slot.name} />
                          ))}
                        </Stack>
                      </Stack>
                    </CardContent>
                  </LinkCardActionArea>
                </Card>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
