import { Container, Box } from "@mui/material";
import { notFound } from "next/navigation";
import { getScheduleWithPermission } from "@/lib/actions/game-schedules";
import ScheduleDetail from "@/components/features/schedules/ScheduleDetail";

export default async function ScheduleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const result = await getScheduleWithPermission(id);
  if (!result) {
    notFound();
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <ScheduleDetail schedule={result.schedule} canEdit={result.canEdit} />
      </Box>
    </Container>
  );
}
