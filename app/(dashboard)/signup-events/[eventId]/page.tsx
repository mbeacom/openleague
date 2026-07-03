import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Stack,
  Typography,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { getManagedSignupEvent } from "@/lib/actions/signup-events";
import { getEventRoster } from "@/lib/actions/event-registrations";
import { listEventInvitations } from "@/lib/actions/event-invitations";
import { EventStatusActions, RosterTable } from "@/components/features/signup-events";
import { InvitePanel } from "@/components/features/signup-events/InvitePanel";
import { AGE_CLASSIFICATION_LABELS } from "@/lib/utils/age-level";
import { formatDateTime } from "@/lib/utils/date";
import { getBaseUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, "default" | "success" | "warning" | "error"> = {
  DRAFT: "warning",
  PUBLISHED: "success",
  CANCELED: "error",
  COMPLETED: "default",
};

export default async function ManageSignupEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const [event, roster, invitations] = await Promise.all([
    getManagedSignupEvent(eventId),
    getEventRoster({ eventId }),
    listEventInvitations(eventId),
  ]);
  if (!event) {
    notFound();
  }

  const hostName =
    event.hostOrganization?.name ?? event.hostLeague?.name ?? event.hostTeam?.name ?? "";
  const shareUrl =
    event.visibility === "LINK" && event.linkToken
      ? `${getBaseUrl()}/events/l/${event.linkToken}`
      : event.visibility === "PUBLIC"
        ? `${getBaseUrl()}/events/${event.id}`
        : null;

  return (
    <Container maxWidth="lg">
      <Stack spacing={3} sx={{ py: { xs: 3, md: 5 } }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ sm: "flex-start" }}
        >
          <Stack spacing={0.5}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="h4" component="h1">
                {event.title}
              </Typography>
              <Chip size="small" label={event.status.toLowerCase()} color={STATUS_COLORS[event.status] ?? "default"} />
              <Chip size="small" variant="outlined" label={event.visibility.replace("_", " ").toLowerCase()} />
            </Stack>
            <Typography color="text.secondary">
              {formatDateTime(event.startAt)} – {formatDateTime(event.endAt)} ·{" "}
              {event.venue?.name ?? event.locationText ?? "Location TBD"} · {hostName} ·{" "}
              {AGE_CLASSIFICATION_LABELS[event.ageClassification]}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button component={Link} href={`/signup-events/${event.id}/edit`} startIcon={<EditIcon />}>
              Edit
            </Button>
            {event.status === "PUBLISHED" && (event.visibility === "PUBLIC" || event.visibility === "LINK") ? (
              <Button
                component={Link}
                href={event.visibility === "LINK" && event.linkToken ? `/events/l/${event.linkToken}` : `/events/${event.id}`}
                startIcon={<OpenInNewIcon />}
              >
                View page
              </Button>
            ) : null}
          </Stack>
        </Stack>

        <EventStatusActions eventId={event.id} status={event.status} visibility={event.visibility} />

        {shareUrl && event.status === "PUBLISHED" ? (
          <Alert severity="info">
            Share this event: <strong>{shareUrl}</strong>
          </Alert>
        ) : null}

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">Roster</Typography>
              <RosterTable eventId={event.id} slots={roster} />
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <InvitePanel
              eventId={event.id}
              invitations={invitations}
              isInviteOnly={event.visibility === "INVITE_ONLY"}
            />
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
