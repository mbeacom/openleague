import { Box, CardContent, Chip, Skeleton, Stack, Typography } from "@mui/material";
import {
  MailOutline as MailOutlineIcon,
  HelpOutline as HelpOutlineIcon,
} from "@mui/icons-material";
import { LinkCard } from "@/components/ui/NextLinkComposites";
import { getAdminAttention } from "@/lib/data/dashboard";
import { formatDateTimeInZone } from "@/lib/utils/date";

/**
 * Admin-only attention items: upcoming events with unanswered RSVPs and
 * pending invitations, for teams the viewer administers. Renders nothing for
 * non-admins or when nothing needs attention. Async RSC — wrap in
 * <Suspense fallback={<AdminAttentionWidgetSkeleton />}>.
 */
export default async function AdminAttentionWidget({ userId }: { userId: string }) {
  const attention = await getAdminAttention(userId);
  if (!attention) return null;

  const { events, pendingInvitations } = attention;
  if (events.length === 0 && pendingInvitations.length === 0) return null;

  return (
    <Box component="section">
      <Typography variant="h5" component="h2" sx={{ mb: 2 }}>
        Needs Your Attention
      </Typography>

      <Stack spacing={1.5}>
        {events.map((event) => (
          <LinkCard
            key={event.id}
            variant="outlined"
            href={`/events/${event.id}`}
            sx={{
              textDecoration: "none",
              color: "inherit",
              transition: "all 0.2s",
              "&:hover": {
                borderColor: "primary.main",
                boxShadow: 1,
              },
            }}
          >
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                spacing={1}
              >
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
                  <HelpOutlineIcon sx={{ color: "warning.main", fontSize: 20 }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" fontWeight={600} noWrap>
                      {event.title}
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={1.5}
                      sx={{ color: "text.secondary" }}
                      flexWrap="wrap"
                      useFlexGap
                    >
                      <Typography variant="caption">{event.teamName}</Typography>
                      <Typography variant="caption">
                        {formatDateTimeInZone(event.startAt, event.timezone)}
                      </Typography>
                    </Stack>
                  </Box>
                </Stack>
                <Chip
                  label={`${event.noResponseCount} unanswered RSVP${
                    event.noResponseCount !== 1 ? "s" : ""
                  }`}
                  color="warning"
                  size="small"
                  variant="outlined"
                />
              </Stack>
            </CardContent>
          </LinkCard>
        ))}

        {pendingInvitations.map((invitation) => (
          <LinkCard
            key={invitation.teamId}
            variant="outlined"
            href={`/team/${invitation.teamId}/roster`}
            sx={{
              textDecoration: "none",
              color: "inherit",
              transition: "all 0.2s",
              "&:hover": {
                borderColor: "primary.main",
                boxShadow: 1,
              },
            }}
          >
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                spacing={1}
              >
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <MailOutlineIcon sx={{ color: "primary.main", fontSize: 20 }} />
                  <Typography variant="subtitle2" fontWeight={600}>
                    {invitation.teamName}
                  </Typography>
                </Stack>
                <Chip
                  label={`${invitation.count} pending invitation${
                    invitation.count !== 1 ? "s" : ""
                  }`}
                  color="primary"
                  size="small"
                  variant="outlined"
                />
              </Stack>
            </CardContent>
          </LinkCard>
        ))}
      </Stack>
    </Box>
  );
}

export function AdminAttentionWidgetSkeleton() {
  return (
    <Box component="section">
      <Skeleton variant="text" width={230} sx={{ fontSize: "1.5rem", mb: 2 }} />
      <Stack spacing={1.5}>
        <Skeleton variant="rounded" height={64} />
        <Skeleton variant="rounded" height={64} />
      </Stack>
    </Box>
  );
}
