import type { Metadata } from "next";
import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { redirect, notFound } from "next/navigation";
import { Container, Box } from "@mui/material";
import { EditSessionWrapper } from "./EditSessionWrapper";
import type { PlayData } from "@/types/practice-planner";

export const metadata: Metadata = {
  title: "Edit Practice Session | OpenLeague",
  description: "Edit a practice session",
};

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function EditPracticeSessionPage({ params }: PageProps) {
  const { sessionId } = await params;
  const userId = await requireUserId();

  // Fetch the session
  const session = await prisma.practiceSession.findUnique({
    where: { id: sessionId },
    include: {
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
    },
  });

  if (!session) {
    notFound();
  }

  // Verify user is admin for this team
  const membership = await prisma.teamMember.findFirst({
    where: {
      userId,
      teamId: session.teamId,
      role: "ADMIN",
    },
  });

  if (!membership) {
    redirect(`/practice-planner/${sessionId}`);
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <EditSessionWrapper
          sessionId={session.id}
          teamId={session.teamId}
          initialData={{
            title: session.title,
            date: session.date,
            duration: session.duration,
            isShared: session.isShared,
            plays: session.plays.map((sp) => ({
              id: sp.id,
              playId: sp.play.id,
              sequence: sp.sequence,
              duration: sp.duration,
              instructions: sp.instructions || "",
              playData: sp.play.playData as unknown as PlayData,
              thumbnail: sp.play.thumbnail || "",
            })),
          }}
        />
      </Box>
    </Container>
  );
}
