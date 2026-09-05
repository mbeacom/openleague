import { Box, Chip, Skeleton, Stack, Typography, CardContent } from "@mui/material";
import {
  ArrowForward as ArrowForwardIcon,
  Place as PlaceIcon,
} from "@mui/icons-material";
import { LinkButton, LinkCard } from "@/components/ui/NextLinkComposites";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { DateBlock } from "@/components/ui/DateBlock";
import { getUpcomingSchedule, type UpcomingEventItem } from "@/lib/data/dashboard";
import { formatDateTimeInZone } from "@/lib/utils/date";

const RSVP_CHIP: Record<
  UpcomingEventItem["rsvpStatus"],
  { label: string; color: "success" | "warning" | "error" | "default" }
> = {
  GOING: { label: "Going", color: "success" },
  MAYBE: { label: "Maybe", color: "warning" },
  NOT_GOING: { label: "Not going", color: "error" },
  NO_RESPONSE: { label: "RSVP needed", color: "default" },
};

/**
 * Schedule-first dashboard widget: events across all the viewer's teams merged
 * with upcoming practice sessions for the next 14 days. Async RSC — fetches its
 * own data; wrap in <Suspense fallback={<UpcomingScheduleWidgetSkeleton />}>.
 */
export default async function UpcomingScheduleWidget({ userId }: { userId: string }) {
  const items = await getUpcomingSchedule(userId);

  return (
    <Box component="section">
      <SectionHeader
        title="Upcoming schedule"
        badge={items.length > 0 ? `next ${items.length}` : undefined}
        action={
          <LinkButton href="/calendar" endIcon={<ArrowForwardIcon />} size="small">
            View calendar
          </LinkButton>
        }
      />

      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Nothing scheduled in the next 14 days.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {items.map((item) => (
            <LinkCard
              key={`${item.kind}-${item.id}`}
              variant="outlined"
              href={item.kind === "event" ? `/events/${item.id}` : `/practice-planner/${item.id}`}
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
                    {/* The date leads every row so a fortnight of items aligns
                        on the day rather than on title length. */}
                    <DateBlock
                      value={item.startAt}
                      timezone={item.kind === "event" ? item.timezone : null}
                    />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2" fontWeight={600} noWrap>
                        {item.title}
                        {item.kind === "event" && item.opponent ? ` vs ${item.opponent}` : ""}
                      </Typography>
                      <Stack
                        direction="row"
                        spacing={1.5}
                        sx={{ color: "text.secondary" }}
                        flexWrap="wrap"
                        useFlexGap
                      >
                        <Typography variant="caption">{item.teamName}</Typography>
                        <Typography variant="caption">
                          {item.kind === "event"
                            ? formatDateTimeInZone(item.startAt, item.timezone)
                            : new Date(item.startAt).toLocaleDateString("en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              })}
                        </Typography>
                        {item.kind === "event" && item.location ? (
                          <Stack direction="row" alignItems="center" spacing={0.5}>
                            <PlaceIcon sx={{ fontSize: 13 }} />
                            <Typography variant="caption">{item.location}</Typography>
                          </Stack>
                        ) : null}
                        {item.kind === "practice" ? (
                          <Typography variant="caption">
                            {item.duration} min · {item.playCount} play
                            {item.playCount !== 1 ? "s" : ""}
                          </Typography>
                        ) : null}
                      </Stack>
                    </Box>
                  </Stack>
                  {item.kind === "event" ? (
                    <Chip
                      label={RSVP_CHIP[item.rsvpStatus].label}
                      color={RSVP_CHIP[item.rsvpStatus].color}
                      size="small"
                      variant={item.rsvpStatus === "NO_RESPONSE" ? "outlined" : "filled"}
                    />
                  ) : (
                    <Chip label="Practice plan" size="small" variant="outlined" />
                  )}
                </Stack>
              </CardContent>
            </LinkCard>
          ))}
        </Stack>
      )}
    </Box>
  );
}

export function UpcomingScheduleWidgetSkeleton() {
  return (
    <Box component="section">
      <Skeleton variant="text" width={220} sx={{ fontSize: "1.5rem", mb: 2 }} />
      <Stack spacing={1.5}>
        <Skeleton variant="rounded" height={64} />
        <Skeleton variant="rounded" height={64} />
        <Skeleton variant="rounded" height={64} />
      </Stack>
    </Box>
  );
}
