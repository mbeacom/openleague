import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { PracticeSessionEditorWrapper } from "./PracticeSessionEditorWrapper";
import { getUserAdminTeamContext } from "@/lib/actions/team-context";
import { getPracticeRosterOptions, getPracticeStaffOptions } from "@/lib/actions/practice-session-queries";
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
  const bookingOptions = await getVenueBookingOptions(context.teamId);
  const staffOptions = await getPracticeStaffOptions(context.teamId);
  const rosterOptions = await getPracticeRosterOptions(context.teamId);

  return (
    <PageContainer>
      <PracticeSessionEditorWrapper
        teamId={context.teamId}
        bookingOptions={bookingOptions}
        staffOptions={staffOptions}
        rosterOptions={rosterOptions}
      />
    </PageContainer>
  );
}
