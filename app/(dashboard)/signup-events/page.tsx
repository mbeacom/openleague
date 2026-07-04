import Link from "next/link";
import {
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Container,
  Stack,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
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
    <Container maxWidth="md">
      <Stack spacing={3} sx={{ py: { xs: 3, md: 5 } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h4" component="h1">
            Signup events
          </Typography>
          <Button component={Link} href="/signup-events/new" variant="contained" startIcon={<AddIcon />}>
            New event
          </Button>
        </Stack>

        {events.length === 0 ? (
          <Typography color="text.secondary">
            No signup events yet. Create one to run clinics, scrimmage nights, tryouts, volunteer
            signups, and more — with per-role capacity limits.
          </Typography>
        ) : (
          <Stack spacing={2}>
            {events.map((event) => {
              const hostName =
                event.hostOrganization?.name ?? event.hostLeague?.name ?? event.hostTeam?.name ?? "";
              return (
                <Card key={event.id}>
                  <CardActionArea component={Link} href={`/signup-events/${event.id}`}>
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
                            {formatDateTime(event.startAt)} · {event.venue?.name ?? event.locationText ?? "TBD"} ·{" "}
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
                  </CardActionArea>
                </Card>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
