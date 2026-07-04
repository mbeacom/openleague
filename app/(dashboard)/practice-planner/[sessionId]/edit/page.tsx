import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, Box } from "@mui/material";
import { EditSessionWrapper } from "./EditSessionWrapper";
import { getPracticeSessionForEdit } from "@/lib/actions/practice-session-queries";
import { getVenueBookingOptions } from "../../venue-booking-options";

export const metadata: Metadata = {
  title: "Edit Practice Session | OpenLeague",
  description: "Edit a practice session",
};

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function EditPracticeSessionPage({ params }: PageProps) {
  const { sessionId } = await params;

  const data = await getPracticeSessionForEdit(sessionId);

  if (data === null) {
    // Session either doesn't exist or user isn't an admin for it
    // Try notFound — the action returns null for missing sessions too
    notFound();
  }

  // Venue/surface/segment options for the optional ice booking (006, FR-019).
  const bookingOptions = await getVenueBookingOptions();

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <EditSessionWrapper
          sessionId={data.sessionId}
          teamId={data.teamId}
          initialData={data.initialData}
          bookingOptions={bookingOptions}
        />
      </Box>
    </Container>
  );
}
