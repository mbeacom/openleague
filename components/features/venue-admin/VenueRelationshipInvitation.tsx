"use client";

import { useTransition, useState } from "react";
import { Alert, Button, Card, CardContent, Stack, Typography } from "@mui/material";
import { respondToVenueRelationship } from "@/lib/actions/venue-relationships";

interface VenueRelationshipInvitationProps {
  relationshipId: string;
  venueName: string;
  relationshipType: string;
}

export function VenueRelationshipInvitation({ relationshipId, venueName, relationshipType }: VenueRelationshipInvitationProps) {
  const [message, setMessage] = useState<{ severity: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const respond = (response: "ACCEPT" | "REJECT") => {
    startTransition(async () => {
      const result = await respondToVenueRelationship({ relationshipId, response });
      if (result.success) {
        setMessage({
          severity: "success",
          text: response === "ACCEPT" ? "Venue relationship accepted." : "Venue relationship rejected.",
        });
        return;
      }

      setMessage({ severity: "error", text: result.error });
    });
  };

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography>{venueName} invited you to become a {relationshipType} rink.</Typography>
          {message ? <Alert severity={message.severity}>{message.text}</Alert> : null}
          <Stack direction="row" spacing={1}>
            <Button variant="contained" disabled={isPending || message?.severity === "success"} onClick={() => respond("ACCEPT")}>
              Accept
            </Button>
            <Button variant="outlined" color="error" disabled={isPending || message?.severity === "success"} onClick={() => respond("REJECT")}>
              Reject
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
