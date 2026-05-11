"use client";

import { Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";

export function SpecialtyEventEditor({ organizationId: _organizationId, venueId: _venueId }: { organizationId: string; venueId: string }) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h5">Specialty event</Typography>
          <TextField label="Event title" />
          <TextField label="Starts at" type="datetime-local" InputLabelProps={{ shrink: true }} />
          <Button variant="contained">Publish event</Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
