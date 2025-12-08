import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Box, Container, Typography, Button, Stack, Alert } from "@mui/material";
import { redirect } from "next/navigation";
import Link from "next/link";
import AddIcon from "@mui/icons-material/Add";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";

export const metadata = {
  title: "Practice Planner | OpenLeague",
  description: "Plan and organize hockey practice sessions",
};

export default async function PracticePlannerPage() {
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

  // Fetch recent practice sessions
  const sessions = await prisma.practiceSession.findMany({
    where: {
      teamId,
      ...(isAdmin ? {} : { isShared: true }),
    },
    orderBy: {
      date: "desc",
    },
    take: 10,
    include: {
      createdBy: {
        select: {
          name: true,
        },
      },
      _count: {
        select: {
          plays: true,
        },
      },
    },
  });

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 3 }}
        >
          <Typography variant="h4" component="h1">
            Practice Planner
          </Typography>
          {isAdmin && (
            <Stack direction="row" spacing={2}>
              <Button
                component={Link}
                href="/practice-planner/library"
                variant="outlined"
                startIcon={<LibraryBooksIcon />}
              >
                Play Library
              </Button>
              <Button
                component={Link}
                href="/practice-planner/new"
                variant="contained"
                startIcon={<AddIcon />}
              >
                New Session
              </Button>
            </Stack>
          )}
        </Stack>

        {!isAdmin && (
          <Alert severity="info" sx={{ mb: 3 }}>
            Only shared practice sessions are visible to team members.
          </Alert>
        )}

        {sessions.length === 0 ? (
          <Box
            sx={{
              textAlign: "center",
              py: 8,
              px: 3,
              bgcolor: "grey.50",
              borderRadius: 2,
            }}
          >
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No practice sessions yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {isAdmin
                ? "Create your first practice session to get started."
                : "Practice sessions will appear here once shared by your coach."}
            </Typography>
            {isAdmin && (
              <Button
                component={Link}
                href="/practice-planner/new"
                variant="contained"
                startIcon={<AddIcon />}
              >
                Create Practice Session
              </Button>
            )}
          </Box>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, 1fr)",
                md: "repeat(3, 1fr)",
              },
              gap: 3,
            }}
          >
            {sessions.map((session) => (
              <Box
                key={session.id}
                component={Link}
                href={`/practice-planner/${session.id}`}
                sx={{
                  display: "block",
                  p: 3,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 2,
                  textDecoration: "none",
                  color: "inherit",
                  transition: "all 0.2s",
                  "&:hover": {
                    borderColor: "primary.main",
                    boxShadow: 2,
                  },
                }}
              >
                <Typography variant="h6" gutterBottom noWrap>
                  {session.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {new Date(session.date).toLocaleDateString()} •{" "}
                  {session.duration} min
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {session._count.plays} plays • Created by{" "}
                  {session.createdBy.name || "Unknown"}
                </Typography>
                {session.isShared && (
                  <Typography
                    variant="caption"
                    sx={{
                      mt: 1,
                      display: "inline-block",
                      px: 1,
                      py: 0.5,
                      bgcolor: "primary.light",
                      color: "primary.contrastText",
                      borderRadius: 1,
                    }}
                  >
                    Shared
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Container>
  );
}
