import {
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import { LinkButton, LinkCardActionArea } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { listMySignupEvents } from "@/lib/actions/signup-events";
import { formatDateTime } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, "default" | "success" | "warning" | "error"> = {
  DRAFT: "warning",
  PUBLISHED: "success",
  CANCELED: "error",
  COMPLETED: "default",
};

export default async function SignupEventsPage() {
  const events = await listMySignupEvents();

  return (
    <PageContainer maxWidth="md">
      <PageHeader
        title="Signup events"
        actions={
          <LinkButton href="/signup-events/new" variant="contained" startIcon={<AddIcon />}>
            New event
          </LinkButton>
        }
      />

      {events.length === 0 ? (
        <EmptyState
          icon={<EventAvailableIcon />}
          title="No signup events yet"
          description="Create one to run clinics, scrimmage nights, tryouts, volunteer signups, and more — with per-role capacity limits."
          action={
            <LinkButton href="/signup-events/new" variant="contained" startIcon={<AddIcon />}>
              Create your first event
            </LinkButton>
          }
        />
      ) : (
        <Stack spacing={2}>
          {events.map((event) => {
            const hostName =
              event.hostOrganization?.name ?? event.hostLeague?.name ?? event.hostTeam?.name ?? "";
            return (
              <Card key={event.id}>
                <LinkCardActionArea href={`/signup-events/${event.id}`}>
                  <CardContent>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      justifyContent="space-between"
                      alignItems={{ sm: "center" }}
                    >
                      <Stack spacing={0.5}>
                        <Typography variant="h6">{event.title}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {formatDateTime(event.startAt, event.timezone)} · {event.venue?.name ?? event.locationText ?? "TBD"} ·{" "}
                          {hostName}
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={1}>
                        <Chip
                          size="small"
                          label={event.status.toLowerCase()}
                          color={STATUS_COLORS[event.status] ?? "default"}
                        />
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`${event._count.registrations} signup${event._count.registrations === 1 ? "" : "s"}`}
                        />
                      </Stack>
                    </Stack>
                  </CardContent>
                </LinkCardActionArea>
              </Card>
            );
          })}
        </Stack>
      )}
    </PageContainer>
  );
}
