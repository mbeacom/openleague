import { Box, Card, CardContent, Skeleton, Stack, Typography } from "@mui/material";
import { CheckCircleOutline as CheckCircleOutlineIcon } from "@mui/icons-material";
import { LinkMuiLink } from "@/components/ui/NextLinkComposites";
import { RSVPButtons } from "@/components/features/events/RSVPButtons";
import { getNeedsRsvp } from "@/lib/data/dashboard";
import { formatDateTimeInZone } from "@/lib/utils/date";

/**
 * The viewer's unanswered RSVPs on future events, with inline RSVP response.
 * Async RSC — the only client leaf is the reused RSVPButtons component (all
 * props crossing that boundary are serializable strings). Wrap in
 * <Suspense fallback={<NeedsRsvpWidgetSkeleton />}>.
 */
export default async function NeedsRsvpWidget({ userId }: { userId: string }) {
  const items = await getNeedsRsvp(userId);

  return (
    <Box component="section">
      <Typography variant="h5" component="h2" sx={{ mb: 2 }}>
        Needs Your RSVP
      </Typography>

      {items.length === 0 ? (
        <Stack direction="row" alignItems="center" spacing={1} sx={{ color: "text.secondary" }}>
          <CheckCircleOutlineIcon fontSize="small" color="success" />
          <Typography variant="body2">
            You&apos;re all caught up — no RSVPs waiting.
          </Typography>
        </Stack>
      ) : (
        <Stack spacing={1.5}>
          {items.map((item) => (
            <Card key={item.eventId} variant="outlined">
              <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Stack spacing={1.5}>
                  <Box>
                    <LinkMuiLink
                      href={`/events/${item.eventId}`}
                      variant="subtitle2"
                      color="inherit"
                      underline="hover"
                      sx={{ fontWeight: 600 }}
                    >
                      {item.title}
                      {item.opponent ? ` vs ${item.opponent}` : ""}
                    </LinkMuiLink>
                    <Stack
                      direction="row"
                      spacing={1.5}
                      sx={{ color: "text.secondary" }}
                      flexWrap="wrap"
                      useFlexGap
                    >
                      <Typography variant="caption">{item.teamName}</Typography>
                      <Typography variant="caption">
                        {formatDateTimeInZone(item.startAt, item.timezone)}
                      </Typography>
                      {item.location ? (
                        <Typography variant="caption">{item.location}</Typography>
                      ) : null}
                    </Stack>
                  </Box>
                  <RSVPButtons eventId={item.eventId} currentStatus="NO_RESPONSE" />
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
    </Box>
  );
}

export function NeedsRsvpWidgetSkeleton() {
  return (
    <Box component="section">
      <Skeleton variant="text" width={200} sx={{ fontSize: "1.5rem", mb: 2 }} />
      <Stack spacing={1.5}>
        <Skeleton variant="rounded" height={120} />
        <Skeleton variant="rounded" height={120} />
      </Stack>
    </Box>
  );
}
