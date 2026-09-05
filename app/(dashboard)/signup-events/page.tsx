import { Box, Card, Chip, Stack, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import PlaceIcon from "@mui/icons-material/Place";
import { LinkButton, LinkCardActionArea } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Crest } from "@/components/ui/Crest";
import { DateBlock } from "@/components/ui/DateBlock";
import {
  listMySignupEvents,
  listMySignupEventsGrouped,
} from "@/lib/actions/signup-events";
import { formatDateTime } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, "default" | "success" | "warning" | "error"> = {
  DRAFT: "warning",
  PUBLISHED: "success",
  CANCELED: "error",
  COMPLETED: "default",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  CANCELED: "Canceled",
  COMPLETED: "Completed",
};

/** The host that owns an event, whichever of the three columns is set. */
function resolveHost(event: Awaited<ReturnType<typeof listMySignupEvents>>[number]) {
  if (event.hostLeague) {
    return {
      id: event.hostLeague.id,
      name: event.hostLeague.name,
      logoUrl: event.hostLeague.logoUrl,
      brandColor: event.hostLeague.brandPrimaryColor,
    };
  }
  if (event.hostTeam) {
    return {
      id: event.hostTeam.id,
      name: event.hostTeam.name,
      logoUrl: event.hostTeam.logoUrl,
      brandColor: event.hostTeam.brandPrimaryColor,
    };
  }
  if (event.hostOrganization) {
    return {
      id: event.hostOrganization.id,
      name: event.hostOrganization.name,
      logoUrl: null,
      brandColor: null,
    };
  }
  return null;
}

export default async function SignupEventsPage() {
  // Split into what is still ahead and what already ran — the way an organizer
  // works: the top of the page is what needs attention, the archive stays
  // reachable without competing for it.
  const { upcoming, past } = await listMySignupEventsGrouped();
  const total = upcoming.length + past.length;

  return (
    <PageContainer>
      <PageHeader
        title="Signup events"
        subtitle="Clinics, scrimmages, tryouts, and volunteer signups you organize."
        actions={
          <LinkButton href="/signup-events/new" variant="contained" startIcon={<AddIcon />}>
            New event
          </LinkButton>
        }
      />

      {total === 0 ? (
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
        <Stack spacing={4}>
          {upcoming.length > 0 ? (
            <Box component="section">
              <SectionHeader title="Upcoming" badge={upcoming.length} />
              <Stack spacing={1.5}>
                {upcoming.map((event) => (
                  <SignupEventRow key={event.id} event={event} />
                ))}
              </Stack>
            </Box>
          ) : null}

          {past.length > 0 ? (
            <Box component="section">
              <SectionHeader title="Past" badge={past.length} />
              <Stack spacing={1.5}>
                {past.map((event) => (
                  <SignupEventRow key={event.id} event={event} muted />
                ))}
              </Stack>
            </Box>
          ) : null}
        </Stack>
      )}
    </PageContainer>
  );
}

function SignupEventRow({
  event,
  muted = false,
}: {
  event: Awaited<ReturnType<typeof listMySignupEvents>>[number];
  muted?: boolean;
}) {
  const host = resolveHost(event);
  const place = event.venue?.name ?? event.locationText ?? "Location TBD";
  const registrations = event._count.registrations;

  return (
    <Card
      variant="outlined"
      sx={{
        opacity: muted ? 0.72 : 1,
        transition: "border-color 0.2s, box-shadow 0.2s",
        "&:hover": { borderColor: "secondary.main", boxShadow: 1, opacity: 1 },
      }}
    >
      <LinkCardActionArea href={`/signup-events/${event.id}`} sx={{ p: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ width: "100%" }}>
          <DateBlock value={event.startAt} timezone={event.timezone} />

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              {event.title}
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mt: 0.5, color: "text.secondary" }}
            >
              <PlaceIcon sx={{ fontSize: 14 }} />
              <Typography variant="body2" noWrap>
                {formatDateTime(event.startAt, event.timezone)} · {place}
              </Typography>
            </Stack>
            {host ? (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                <Crest
                  name={host.name}
                  id={host.id}
                  logoUrl={host.logoUrl}
                  brandColor={host.brandColor}
                  size="xs"
                />
                <Typography variant="caption" color="text.secondary" noWrap>
                  {host.name}
                </Typography>
              </Stack>
            ) : null}
          </Box>

          <Stack spacing={1} alignItems="flex-end" sx={{ flexShrink: 0 }}>
            <Chip
              size="small"
              label={STATUS_LABELS[event.status] ?? event.status}
              color={STATUS_COLORS[event.status] ?? "default"}
              variant={event.status === "PUBLISHED" ? "filled" : "outlined"}
            />
            <Box sx={{ textAlign: "right" }}>
              <Box
                component="span"
                sx={{
                  fontFamily: "var(--font-mono), ui-monospace, monospace",
                  fontVariantNumeric: "tabular-nums",
                  fontSize: "1.125rem",
                  fontWeight: 500,
                  display: "block",
                  lineHeight: 1.1,
                }}
              >
                {registrations}
              </Box>
              <Box
                component="span"
                sx={{
                  fontSize: "0.5625rem",
                  fontWeight: 700,
                  letterSpacing: "0.09em",
                  textTransform: "uppercase",
                  color: "text.secondary",
                }}
              >
                {registrations === 1 ? "Signup" : "Signups"}
              </Box>
            </Box>
          </Stack>
        </Stack>
      </LinkCardActionArea>
    </Card>
  );
}
