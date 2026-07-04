import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container, Box } from "@mui/material";
import { PracticeSessionEditorWrapper } from "./PracticeSessionEditorWrapper";
import { getUserAdminTeamContext } from "@/lib/actions/team-context";
import { getVenueBookingOptions } from "../venue-booking-options";

export const metadata: Metadata = {
  title: "New Practice Session | OpenLeague",
  description: "Create a new practice session",
};

export default async function NewPracticeSessionPage() {
  const context = await getUserAdminTeamContext();

  if (!context) {
    redirect("/practice-planner");
  }

  // Venue/surface/segment options for the optional ice booking (006, FR-019).
  const bookingOptions = await getVenueBookingOptions();

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <PracticeSessionEditorWrapper
          teamId={context.teamId}
          bookingOptions={bookingOptions}
        />
      </Box>
    </Container>
  );
}
