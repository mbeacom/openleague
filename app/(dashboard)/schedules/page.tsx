import { Container, Box, Typography } from "@mui/material";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getSchedulesForContext } from "@/lib/actions/game-schedules";
import ScheduleList from "@/components/features/schedules/ScheduleList";

export default async function SchedulesPage() {
  const userId = await requireUserId();

  const membership = await prisma.teamMember.findFirst({
    where: { userId },
    select: { role: true, team: { select: { id: true, leagueId: true } } },
  });

  if (!membership) {
    redirect("/");
  }

  const isAdmin = membership.role === "ADMIN";

  const schedules = await getSchedulesForContext({
    teamId: membership.team.id,
    leagueId: membership.team.leagueId || undefined,
  });

  const serialized = schedules.map((s) => ({
    ...s,
    startDate: s.startDate.toISOString(),
    endDate: s.endDate.toISOString(),
  }));

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Game Schedules
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Build and manage season schedules with round-robin matchups across venues.
        </Typography>
        <ScheduleList schedules={serialized} isAdmin={isAdmin} />
      </Box>
    </Container>
  );
}
