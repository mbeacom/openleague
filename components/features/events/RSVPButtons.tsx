"use client";

import { Box, Button, Typography } from "@mui/material";
import { CheckCircle, Cancel, Help } from "@mui/icons-material";

interface RSVPButtonsProps {
  eventId: string;
  currentStatus: string;
}

export default function RSVPButtons({ eventId, currentStatus }: RSVPButtonsProps) {
  // Placeholder component - full implementation in task 10
  const handleRSVP = (status: string) => {
    console.log(`RSVP ${status} for event ${eventId}`);
    // TODO: Implement RSVP functionality in task 10
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Your Response
      </Typography>
      <Box
        sx={{
          display: "flex",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Button
          variant={currentStatus === "GOING" ? "contained" : "outlined"}
          color="success"
          startIcon={<CheckCircle />}
          onClick={() => handleRSVP("GOING")}
          sx={{ minHeight: 48, flex: { xs: "1 1 100%", sm: "0 1 auto" } }}
        >
          Going
        </Button>
        <Button
          variant={currentStatus === "NOT_GOING" ? "contained" : "outlined"}
          color="error"
          startIcon={<Cancel />}
          onClick={() => handleRSVP("NOT_GOING")}
          sx={{ minHeight: 48, flex: { xs: "1 1 100%", sm: "0 1 auto" } }}
        >
          Not Going
        </Button>
        <Button
          variant={currentStatus === "MAYBE" ? "contained" : "outlined"}
          color="warning"
          startIcon={<Help />}
          onClick={() => handleRSVP("MAYBE")}
          sx={{ minHeight: 48, flex: { xs: "1 1 100%", sm: "0 1 auto" } }}
        >
          Maybe
        </Button>
      </Box>
    </Box>
  );
}
