import { ArrowBackOutlined } from "@mui/icons-material";
import { Alert, Card, Chip, Divider, Stack, Typography } from "@mui/material";
import { notFound } from "next/navigation";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { getGearReservationContext } from "@/lib/actions/gear-context";
import { getGearInventoryContext } from "@/lib/actions/gear-context";
import { GearReservationLifecycleControls } from "@/components/features/gear/GearReservationLifecycleControls";
import { LinkButton } from "@/components/ui/NextLinkComposites";

interface GearReservationDetailPageProps {
  params: Promise<{ leagueId: string; reservationId: string }>;
}

export default async function GearReservationDetailPage({ params }: GearReservationDetailPageProps) {
  const { leagueId, reservationId } = await params;
  const [data, inventory] = await Promise.all([
    getGearReservationContext(leagueId),
    getGearInventoryContext(leagueId),
  ]);
  const reservation = data?.reservations.find((candidate) => candidate.id === reservationId);
  if (!data || !reservation) notFound();

  return (
    <PageContainer maxWidth="md">
      <LinkButton href={`/league/${leagueId}/gear/reservations`} startIcon={<ArrowBackOutlined />} sx={{ minHeight: 44, mb: 1 }}>
        All reservations
      </LinkButton>
      <PageHeader title={`${reservation.teamName} gear reservation`} subtitle={`${reservation.requestedStartDate.slice(0, 10)} to ${reservation.requestedEndDate.slice(0, 10)}`} />
      <Stack spacing={2}>
        {(reservation.overdue || reservation.reallocationWarning) && (
          <Alert severity="warning">
            {reservation.overdue ? "This custody period is overdue." : "Inventory has changed; this future reservation may need reallocation."}
          </Alert>
        )}
        <Card variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6">Request</Typography>
              <Chip label={reservation.status.replace("_", " ")} />
            </Stack>
            <Typography>Custody contact: {reservation.custodianName}</Typography>
            {reservation.requestNotes && <Typography variant="body2">{reservation.requestNotes}</Typography>}
            {data.canManageReservations && reservation.decisionNotes && (
              <Typography variant="body2">Admin decision: {reservation.decisionNotes}</Typography>
            )}
          </Stack>
        </Card>
        <GearReservationLifecycleControls
          leagueId={leagueId}
          reservation={reservation}
          canManage={data.canManageReservations}
          inventory={inventory}
        />
        <Card variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Requested items</Typography>
          <Stack divider={<Divider flexItem />}>
            {reservation.lines.map((line) => (
              <Typography key={line.id}>
                {line.name}: {line.allocatedQty}/{line.approvedQty || line.requestedQty} allocated
              </Typography>
            ))}
          </Stack>
        </Card>
        <Card variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Custody and ledger</Typography>
          <Stack divider={<Divider flexItem />}>
            {reservation.allocations.length === 0 ? (
              <Typography color="text.secondary">No inventory has been allocated.</Typography>
            ) : reservation.allocations.map((allocation) => (
              <Typography key={allocation.id}>
                {allocation.assetTag ?? allocation.locationName ?? "Pooled stock"}: {allocation.status.replace("_", " ")} ({allocation.returnedQty}/{allocation.pickedUpQty} returned)
              </Typography>
            ))}
          </Stack>
        </Card>
      </Stack>
    </PageContainer>
  );
}
