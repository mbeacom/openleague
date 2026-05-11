"use client";

import { Button, Card, CardContent, Stack, Typography } from "@mui/material";

interface VenueRelationshipInvitationProps {
  relationshipId: string;
  venueName: string;
  relationshipType: string;
}

export function VenueRelationshipInvitation({ relationshipId: _relationshipId, venueName, relationshipType }: VenueRelationshipInvitationProps) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography>{venueName} invited you to become a {relationshipType} rink.</Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="contained">Accept</Button>
            <Button variant="outlined" color="error">
              Reject
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
