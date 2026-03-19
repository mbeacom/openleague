import { Box, Container } from "@mui/material";
import { redirect } from "next/navigation";
import EventForm from "@/components/features/events/EventForm";
import { getUserTeamContext } from "@/lib/actions/team-context";

export default async function NewEventPage() {
  const context = await getUserTeamContext();

  if (!context) {
    redirect("/");
  }

  if (!context.isAdmin) {
    redirect("/calendar");
  }

  return (
    <Container maxWidth="md">
      <Box
        sx={{
          py: 4,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <EventForm teamId={context.teamId} />
      </Box>
    </Container>
  );
}
