"use client";

import { Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { SkillLevelSelector } from "./SkillLevelSelector";

export function LessonOfferingEditor({ organizationId: _organizationId, venueId: _venueId }: { organizationId: string; venueId: string }) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h5">Lesson offering</Typography>
          <TextField label="Lesson title" />
          <TextField label="Lesson type" placeholder="GROUP" />
          <SkillLevelSelector skillLevels={[]} />
          <Button variant="contained">Save lesson</Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
