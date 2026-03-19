import { Box, Container, Typography, Button, Stack, Alert } from "@mui/material";
import { redirect } from "next/navigation";
import Link from "next/link";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { PlayLibrary } from "@/components/features/practice-planner/PlayLibrary";
import { getPlayLibraryContext } from "@/lib/actions/practice-session-queries";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Play Library | OpenLeague",
  description: "Browse and manage your saved plays",
};

export default async function PlayLibraryPage() {
  const context = await getPlayLibraryContext();

  if (!context) {
    redirect("/dashboard");
  }

  if (!context.isAdmin) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ py: 4 }}>
          <Alert severity="warning">
            Only team admins can access the play library.
          </Alert>
          <Button
            component={Link}
            href="/practice-planner"
            startIcon={<ArrowBackIcon />}
            sx={{ mt: 2 }}
          >
            Back to Practice Planner
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 3 }}
        >
          <Stack direction="row" alignItems="center" spacing={2}>
            <Button
              component={Link}
              href="/practice-planner"
              startIcon={<ArrowBackIcon />}
              size="small"
            >
              Back
            </Button>
            <Typography variant="h4" component="h1">
              Play Library
            </Typography>
          </Stack>
        </Stack>

        <PlayLibrary teamId={context.teamId} mode="manage" />
      </Box>
    </Container>
  );
}
