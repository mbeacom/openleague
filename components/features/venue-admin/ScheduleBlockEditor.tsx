import { Card, CardContent, Stack, TextField, Typography } from "@mui/material";

interface ScheduleBlockEditorProps {
  organizationId: string;
  venueId: string;
}

export function ScheduleBlockEditor({ organizationId, venueId }: ScheduleBlockEditorProps) {
  return (
    <Card aria-labelledby="schedule-block-heading">
      <CardContent>
        <Stack spacing={2} data-organization-id={organizationId} data-venue-id={venueId}>
          <Typography id="schedule-block-heading" variant="h6" component="h2">
            Schedule block
          </Typography>
          <TextField label="Title" size="small" disabled fullWidth />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField label="Starts" size="small" disabled fullWidth />
            <TextField label="Ends" size="small" disabled fullWidth />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Create and publish bookable public ice-time blocks from the venue schedule actions.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}