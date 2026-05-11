import { Card, CardContent, Chip, Stack, Typography } from "@mui/material";

interface VenueScheduleBlockSummary {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  activityType: string;
  status: string;
}

interface VenueScheduleCalendarProps {
  blocks?: VenueScheduleBlockSummary[];
}

export function VenueScheduleCalendar({ blocks = [] }: VenueScheduleCalendarProps) {
  return (
    <Card aria-labelledby="venue-schedule-heading">
      <CardContent>
        <Stack spacing={2}>
          <Typography id="venue-schedule-heading" variant="h6" component="h2">
            Venue schedule
          </Typography>
          {blocks.length > 0 ? (
            <Stack spacing={1}>
              {blocks.map((block) => (
                <Stack key={block.id} spacing={0.5} sx={{ borderLeft: 4, borderColor: "primary.main", pl: 2 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography fontWeight={700}>{block.title}</Typography>
                    <Chip size="small" label={block.activityType} />
                    <Chip size="small" color={block.status === "PUBLISHED" ? "success" : "default"} label={block.status} />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {block.startsAt.toLocaleString()} – {block.endsAt.toLocaleString()}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No schedule blocks are published yet.
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}