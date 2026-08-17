import { ArrowBackOutlined } from "@mui/icons-material";
import { Alert, Card, Chip, Divider, Stack, Typography } from "@mui/material";
import { notFound } from "next/navigation";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { getGearReservationContext } from "@/lib/actions/gear-context";
import { GearReservationLifecycleControls } from "@/components/features/gear/GearReservationLifecycleControls";

interface GearReservationDetailPageProps {
  params: Promise<{ leagueId: string; reservationId: string }>;
}

export default async function GearReservationDetailPage({ params }: GearReservationDetailPageProps) {
  const { leagueId, reservationId } = await params;
  const data = await getGearReservationContext(leagueId);
  const reservation = data?.reservations.find((candidate) => candidate.id === reservationId);
  if (!data || !reservation) notFound();

  const asDate = (value: string) => value.slice(0, 10);
  const requestedWindow = `${asDate(reservation.requestedStartDate)} to ${asDate(reservation.requestedEndDate)}`;
  const approvedWindow = reservation.approvedStartDate && reservation.approvedEndDate
    ? `${asDate(reservation.approvedStartDate)} to ${asDate(reservation.approvedEndDate)}`
    : null;

  return (
    <PageContainer maxWidth="md">
      <LinkButton href={`/league/${leagueId}/gear/reservations`} startIcon={<ArrowBackOutlined />} sx={{ minHeight: 44, mb: 1 }}>
        All reservations
      </LinkButton>
      <PageHeader
        title={`${reservation.teamName} gear reservation`}
        subtitle={approvedWindow ? `Approved ${approvedWindow}` : `Requested ${requestedWindow}`}
      />
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
            {approvedWindow ? (
              <>
                <Typography>Approved window: {approvedWindow}</Typography>
                {approvedWindow !== requestedWindow && (
                  <Typography variant="body2" color="text.secondary">
                    Requested window: {requestedWindow}
                  </Typography>
                )}
              </>
            ) : (
              <Typography>Requested window: {requestedWindow} (not yet approved)</Typography>
            )}
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
              <Stack key={allocation.id} spacing={0.25} sx={{ py: 0.5 }}>
                <Typography>
                  {allocation.assetTag ?? allocation.locationName ?? "Pooled stock"}: {allocation.status.replace("_", " ")} ({allocation.returnedQty}/{allocation.pickedUpQty} returned)
                </Typography>
                {allocation.effectiveStartDate && allocation.effectiveEndDate && (
                  <Typography variant="body2" color={allocation.overdue ? "error.main" : "text.secondary"}>
                    Approved dates: {asDate(allocation.effectiveStartDate)} to {asDate(allocation.effectiveEndDate)}
                    {allocation.overdue ? " (overdue)" : ""}
                  </Typography>
                )}
              </Stack>
            ))}
          </Stack>
        </Card>
      </Stack>
    </PageContainer>
  );
}
