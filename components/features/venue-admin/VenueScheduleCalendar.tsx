import { Card, CardContent, Chip, Stack, Typography } from "@mui/material";

interface ScheduleBlockSummary {
  id: string;
  title: string;
  startsAt: Date | string;
  endsAt: Date | string;
  activityType: string;
  status: string;
  surface?: { id: string; name: string } | null;
}

interface VenueScheduleCalendarProps {
  blocks: ScheduleBlockSummary[];
}

export function VenueScheduleCalendar({ blocks }: VenueScheduleCalendarProps) {
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Venue schedule</Typography>
      {blocks.length === 0 ? (
        <Typography color="text.secondary">No schedule blocks are currently published.</Typography>
      ) : (
        blocks.map((block) => (
          <Card key={block.id}>
            <CardContent>
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography variant="h6">{block.title}</Typography>
                  <Chip label={block.activityType} size="small" />
                  <Chip label={block.status} size="small" />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {formatDateTime(block.startsAt)} - {formatDateTime(block.endsAt)}
                  {block.surface ? ` · ${block.surface.name}` : ""}
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        ))
      )}
    </Stack>
  );
}

function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString();
}
