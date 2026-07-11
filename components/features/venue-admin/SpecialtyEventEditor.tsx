"use client";

import { Button, Card, CardContent, Chip, Stack, Typography } from "@mui/material";

/**
 * Placeholder for the specialty-event publishing flow (feature 002). The
 * backing Server Action does not exist yet, so this renders an explicit
 * "coming soon" state instead of inert form controls — see the Tier 1
 * foundations design (workstream B1).
 */
export function SpecialtyEventEditor({ organizationId: _organizationId, venueId: _venueId }: { organizationId: string; venueId: string }) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h5">Specialty event</Typography>
            <Chip label="Coming soon" size="small" color="default" />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Publishing one-off specialty events (holiday skates, tournaments, exhibitions)
            to your public rink page isn&apos;t available yet.
          </Typography>
          <Button variant="contained" disabled sx={{ alignSelf: "flex-start" }}>
            Publish event
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
