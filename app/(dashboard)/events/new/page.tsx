import { Box } from "@mui/material";
import { redirect } from "next/navigation";
import EventForm from "@/components/features/events/EventForm";
import { getUserTeamContext } from "@/lib/actions/team-context";
import { PageContainer } from "@/components/ui/PageContainer";

export default async function NewEventPage() {
  const context = await getUserTeamContext();

  if (!context) {
    redirect("/");
  }

  if (!context.isAdmin) {
    redirect("/calendar");
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
