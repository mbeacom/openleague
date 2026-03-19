import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container, Box } from "@mui/material";
import { PracticeSessionEditorWrapper } from "./PracticeSessionEditorWrapper";
import { getUserAdminTeamContext } from "@/lib/actions/team-context";

export const metadata: Metadata = {
  title: "New Practice Session | OpenLeague",
  description: "Create a new practice session",
};

export default async function NewPracticeSessionPage() {
  const context = await getUserAdminTeamContext();

  if (!context) {
    redirect("/practice-planner");
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <PracticeSessionEditorWrapper teamId={context.teamId} />
      </Box>
    </Container>
  );
}
