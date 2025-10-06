import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Box, Container } from "@mui/material";
import { redirect } from "next/navigation";
import EventForm from "@/components/features/events/EventForm";

export default async function NewEventPage() {
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
    redirect("/");
  }

  // Only admins can create events
  if (teamMember.role !== "ADMIN") {
    redirect("/calendar");
  }

  const teamId = teamMember.team.id;

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
        <EventForm teamId={teamId} />
      </Box>
    </Container>
  );
}
