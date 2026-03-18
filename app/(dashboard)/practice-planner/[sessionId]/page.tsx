import type { Metadata } from "next";
import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { redirect, notFound } from "next/navigation";
import { Container, Box } from "@mui/material";
import { SessionDetailView } from "./SessionDetailView";

export const metadata: Metadata = {
  title: "Practice Session | OpenLeague",
  description: "View practice session details",
};

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function PracticeSessionDetailPage({ params }: PageProps) {
  const { sessionId } = await params;
  const userId = await requireUserId();

  // Get user's team membership
  const teamMember = await prisma.teamMember.findFirst({
    where: { userId },
    orderBy: { joinedAt: "desc" },
  });

  if (!teamMember) {
    redirect("/dashboard");
  }

  // Fetch the session with plays
  const session = await prisma.practiceSession.findUnique({
    where: { id: sessionId },
    include: {
      createdBy: {
        select: { name: true },
      },
      plays: {
        orderBy: { sequence: "asc" },
        include: {
          play: {
            select: {
              id: true,
              name: true,
              description: true,
              thumbnail: true,
              playData: true,
            },
          },
        },
      },
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!session) {
    notFound();
  }

  // Verify user belongs to the session's team
  const membership = await prisma.teamMember.findFirst({
    where: {
      userId,
      teamId: session.teamId,
    },
  });

  if (!membership) {
    redirect("/practice-planner");
  }

  // Non-admins can only see shared sessions
  const isAdmin = membership.role === "ADMIN";
  if (!isAdmin && !session.isShared) {
    redirect("/practice-planner");
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <SessionDetailView
          session={{
            id: session.id,
            title: session.title,
            date: session.date.toISOString(),
            duration: session.duration,
            isShared: session.isShared,
            createdByName: session.createdBy.name || "Unknown",
            teamId: session.team.id,
            teamName: session.team.name,
            plays: session.plays.map((sp) => ({
              id: sp.id,
              sequence: sp.sequence,
              duration: sp.duration,
              instructions: sp.instructions,
              play: {
                id: sp.play.id,
                name: sp.play.name,
                description: sp.play.description,
                thumbnail: sp.play.thumbnail,
              },
            })),
          }}
          isAdmin={isAdmin}
        />
      </Box>
    </Container>
  );
}
