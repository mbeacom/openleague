"use client";

import { Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { SkillLevelSelector } from "./SkillLevelSelector";

interface ScheduleBlockEditorProps {
  organizationId: string;
  venueId: string;
}

export function ScheduleBlockEditor({ organizationId: _organizationId, venueId: _venueId }: ScheduleBlockEditorProps) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h5">Schedule block</Typography>
          <TextField label="Title" name="title" />
          <TextField label="Activity type" name="activityType" placeholder="OPEN_SKATE" />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField label="Starts at" name="startsAt" type="datetime-local" InputLabelProps={{ shrink: true }} fullWidth />
            <TextField label="Ends at" name="endsAt" type="datetime-local" InputLabelProps={{ shrink: true }} fullWidth />
          </Stack>
          <SkillLevelSelector skillLevels={[]} />
          <Button variant="contained">Save schedule block</Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
