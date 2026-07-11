import { Box, Container, Alert } from "@mui/material";
import { redirect } from "next/navigation";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { getPlayLibraryContext } from "@/lib/actions/practice-session-queries";
import { PlayEditorWrapper } from "../PlayEditorWrapper";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Play | OpenLeague",
  description: "Create a new play for your library",
};

export default async function NewPlayPage() {
  const context = await getPlayLibraryContext();

  if (!context) {
    redirect("/dashboard");
  }

  if (!context.isAdmin) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ py: 4 }}>
          <Alert severity="warning">
            Only team admins can create plays.
          </Alert>
          <LinkButton
            href="/practice-planner/library"
            startIcon={<ArrowBackIcon />}
            sx={{ mt: 2 }}
          >
            Back to Play Library
          </LinkButton>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <PlayEditorWrapper teamId={context.teamId} />
      </Box>
    </Container>
  );
}
