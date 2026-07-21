import { Box } from "@mui/material";
import { redirect } from "next/navigation";
import EventForm from "@/components/features/events/EventForm";
import { getUserAdminTeamContext, getUserTeamContext } from "@/lib/actions/team-context";
import { PageContainer } from "@/components/ui/PageContainer";

export default async function NewEventPage() {
  // Prefer any team the user administers so admins of a non-primary team
  // are not bounced back to the calendar.
  const context = await getUserAdminTeamContext();

  if (!context) {
    const memberContext = await getUserTeamContext();
    redirect(memberContext ? "/calendar" : "/");
  }

  return (
    <PageContainer maxWidth="md">
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <EventForm teamId={context.teamId} />
      </Box>
    </PageContainer>
  );
}
