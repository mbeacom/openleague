import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Container, Box } from "@mui/material";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import PracticePlannerList from "@/app/(dashboard)/practice-planner/PracticePlannerList";

export const metadata: Metadata = {
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

  if (!teamMember) {
    redirect("/dashboard");
  }

  const teamId = teamMember.team.id;
  const isAdmin = teamMember.role === "ADMIN";

  // Fetch all practice sessions for this team (filtered by role)
  const sessions = await prisma.practiceSession.findMany({
    where: {
      teamId,
      ...(isAdmin ? {} : { isShared: true }),
    },
    orderBy: {
      date: "desc",
    },
    include: {
      createdBy: {
        select: {
          name: true,
        },
      },
      plays: {
        select: {
          play: {
            select: {
              thumbnail: true,
            },
          },
        },
        orderBy: {
          sequence: "asc",
        },
        take: 1,
      },
      _count: {
        select: {
          plays: true,
        },
      },
    },
  });

  // Serialize dates for client component
  const serializedSessions = sessions.map((session) => ({
    id: session.id,
    title: session.title,
    date: session.date.toISOString(),
    duration: session.duration,
    isShared: session.isShared,
    createdByName: session.createdBy.name || "Unknown",
    playCount: session._count.plays,
    firstPlayThumbnail: session.plays[0]?.play?.thumbnail || null,
  }));

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <PracticePlannerList
          sessions={serializedSessions}
          isAdmin={isAdmin}
          teamName={teamMember.team.name}
        />
      </Box>
    </Container>
  );
}
