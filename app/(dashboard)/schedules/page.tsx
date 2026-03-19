import { Container, Box, Typography } from "@mui/material";
import { redirect } from "next/navigation";
import { getSchedulesForContext, getSchedulesPageContext } from "@/lib/actions/game-schedules";
import ScheduleList from "@/components/features/schedules/ScheduleList";

export default async function SchedulesPage() {
  const context = await getSchedulesPageContext();
  if (!context) {
    redirect("/");
  }

  const schedules = await getSchedulesForContext({
    teamId: context.teamId,
    leagueId: context.leagueId,
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
        <ScheduleList schedules={serialized} isAdmin={context.isAdmin} />
      </Box>
    </Container>
  );
}
