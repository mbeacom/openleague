"use client";

import { Alert, Button, Stack, TextField, Typography } from "@mui/material";

interface IceTimeRequestFormProps {
  scheduleBlockId: string;
  venueId: string;
}

export function IceTimeRequestForm({ scheduleBlockId, venueId }: IceTimeRequestFormProps) {
  return (
    <Stack id={`request-${scheduleBlockId}`} component="form" spacing={2} sx={{ maxWidth: 560 }}>
      <Typography variant="h5">Request ice time</Typography>
      <Alert severity="info">Requesting venue {venueId}</Alert>
      <TextField label="Contact name" name="contactName" required />
      <TextField label="Contact email" name="contactEmail" type="email" required />
      <TextField label="Notes" name="notes" multiline minRows={3} />
      <Button type="submit" variant="contained">
        Submit request
      </Button>
    </Stack>
  );
}
