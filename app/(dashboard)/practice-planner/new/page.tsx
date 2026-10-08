import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { PracticeSessionEditorWrapper } from "./PracticeSessionEditorWrapper";
import { getUserAdminTeamContext } from "@/lib/actions/team-context";
import { getPracticeRosterOptions, getPracticeStaffOptions } from "@/lib/actions/practice-session-queries";
import { getVenueBookingOptions } from "../venue-booking-options";
import { startingDrillRows } from "./starting-drill";

export const metadata: Metadata = {
  title: "New Practice Session | OpenLeague",
  description: "Create a new practice session",
};

interface PageProps {
  /** `?drill=<playId>`: start the practice with this library drill (the drill details page's "Add to new practice"). */
  searchParams?: Promise<{ drill?: string | string[] }>;
}

export default async function NewPracticeSessionPage({ searchParams }: PageProps) {
  const context = await getUserAdminTeamContext();

  if (!context) {
    redirect("/practice-planner");
  }

  // Venue/surface/segment options for the optional ice booking (006, FR-019).
  const bookingOptions = await getVenueBookingOptions(context.teamId);
  const staffOptions = await getPracticeStaffOptions(context.teamId);
  const rosterOptions = await getPracticeRosterOptions(context.teamId);
  const plays = await startingDrillRows((await searchParams)?.drill, context.teamId);

  return (
    <PageContainer>
      <PracticeSessionEditorWrapper
        teamId={context.teamId}
        bookingOptions={bookingOptions}
        staffOptions={staffOptions}
        rosterOptions={rosterOptions}
        {...(plays.length > 0 && { initialPlays: plays })}
      />
    </PageContainer>
  );
}
