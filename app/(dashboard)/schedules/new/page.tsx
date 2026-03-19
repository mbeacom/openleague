import { Container, Box } from "@mui/material";
import { redirect } from "next/navigation";
import { getNewSchedulePageContext } from "@/lib/actions/game-schedules";
import { getAvailableVenues } from "@/lib/actions/venues";
import ScheduleBuilder from "@/components/features/schedules/ScheduleBuilder";

export default async function NewSchedulePage() {
  const context = await getNewSchedulePageContext();
  if (!context) {
    redirect("/schedules");
  }

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
          teams={context.teams}
          venues={venueOptions}
          leagueId={context.leagueId || undefined}
          teamId={context.leagueId ? undefined : context.teamId}
        />
      </Box>
    </Container>
  );
}
