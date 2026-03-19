import { Container, Box } from "@mui/material";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getAvailableVenues } from "@/lib/actions/venues";
import ScheduleBuilder from "@/components/features/schedules/ScheduleBuilder";

export default async function NewSchedulePage() {
  const userId = await requireUserId();

  // Get user's team and league context
  const membership = await prisma.teamMember.findFirst({
    where: { userId, role: "ADMIN" },
    select: { team: { select: { id: true, leagueId: true } } },
  });

  if (!membership) {
    redirect("/schedules");
  }

  // Get teams for the schedule (league teams or just user's teams)
  let teams;
  if (membership.team.leagueId) {
    teams = await prisma.team.findMany({
      where: { leagueId: membership.team.leagueId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  } else {
    // Without a league, get teams the user manages
    const memberships = await prisma.teamMember.findMany({
      where: { userId, role: "ADMIN" },
      select: { team: { select: { id: true, name: true } } },
    });
    teams = memberships.map((m) => m.team);
  }

  // Get available venues
  const venues = await getAvailableVenues();
  const venueOptions = venues.map((v) => ({
    id: v.id,
    name: v.name,
    surfaceType: v.surfaceType,
  }));

  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4 }}>
        <ScheduleBuilder
          teams={teams}
          venues={venueOptions}
          leagueId={membership.team.leagueId || undefined}
          teamId={membership.team.id}
        />
      </Box>
    </Container>
  );
}
