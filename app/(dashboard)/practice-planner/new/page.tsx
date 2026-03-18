import type { Metadata } from "next";
import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";
import { Container, Box } from "@mui/material";
import { PracticeSessionEditorWrapper } from "./PracticeSessionEditorWrapper";

export const metadata: Metadata = {
  title: "New Practice Session | OpenLeague",
  description: "Create a new practice session",
};

export default async function NewPracticeSessionPage() {
  const userId = await requireUserId();

  // Get user's first team where they are an admin
  const teamMember = await prisma.teamMember.findFirst({
    where: { userId, role: "ADMIN" },
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

  // If user has no admin teams, redirect to practice planner
  if (!teamMember) {
    redirect("/practice-planner");
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <PracticeSessionEditorWrapper teamId={teamMember.team.id} />
      </Box>
    </Container>
  );
}
