import { Container, Box } from "@mui/material";
import { requireUserId } from "@/lib/auth/session";
import { notFound } from "next/navigation";
import { getGameSchedule } from "@/lib/actions/game-schedules";
import ScheduleDetail from "@/components/features/schedules/ScheduleDetail";

export default async function ScheduleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();

  const schedule = await getGameSchedule(id);
  if (!schedule) {
    notFound();
  }

  const canEdit = schedule.createdById === userId;

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <ScheduleDetail schedule={schedule} canEdit={canEdit} />
      </Box>
    </Container>
  );
}
