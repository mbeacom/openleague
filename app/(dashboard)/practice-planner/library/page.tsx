import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Box, Container, Typography, Button, Stack, Alert } from "@mui/material";
import { redirect } from "next/navigation";
import Link from "next/link";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { PlayLibrary } from "@/components/features/practice-planner/PlayLibrary";

export const metadata = {
  title: "Play Library | OpenLeague",
  description: "Browse and manage your saved plays",
};

export default async function PlayLibraryPage() {
  const userId = await requireUserId();

  // Get user's first team (MVP: single team focus)
  const teamMember = await prisma.teamMember.findFirst({
    where: { userId },
    include: {
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      joinedAt: "desc",
    },
  });

  // If user has no teams, redirect to dashboard
  if (!teamMember) {
    redirect("/dashboard");
  }

  const teamId = teamMember.team.id;
  const isAdmin = teamMember.role === "ADMIN";

  // Only admins can manage the play library
  if (!isAdmin) {
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

        <PlayLibrary teamId={teamId} mode="manage" />
      </Box>
    </Container>
  );
}
