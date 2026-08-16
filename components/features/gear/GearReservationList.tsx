import { Alert, Box, Card, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import type { GearReservationContext } from "@/lib/actions/gear-context";
import { LinkButton } from "@/components/ui/NextLinkComposites";

const statusColor = {
  DRAFT: "default",
  REQUESTED: "warning",
  APPROVED: "info",
  DECLINED: "error",
  CANCELED: "default",
  FULFILLED: "primary",
  CLOSED: "success",
} as const;

export function GearReservationList({ data }: { data: GearReservationContext }) {
  if (data.reservations.length === 0) {
    return (
      <Alert severity="info">
        No gear reservations are visible for your teams yet.
      </Alert>
    );
  }

  const windows = (reservation: GearReservationContext["reservations"][number]) => {
    const requested = `${reservation.requestedStartDate.slice(0, 10)} to ${reservation.requestedEndDate.slice(0, 10)}`;
    const approved = reservation.approvedStartDate && reservation.approvedEndDate
      ? `${reservation.approvedStartDate.slice(0, 10)} to ${reservation.approvedEndDate.slice(0, 10)}`
      : null;
    return { requested, approved };
  };

  return (
    <>
      <Box sx={{ display: { xs: "block", md: "none" } }}>
        <Stack spacing={2}>
          {data.reservations.map((reservation) => {
            const { requested, approved } = windows(reservation);
            return (
            <Card key={reservation.id} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography fontWeight={700}>{reservation.teamName}</Typography>
                  <Chip size="small" label={reservation.status.replace("_", " ")} color={statusColor[reservation.status]} />
                </Stack>
                <Typography variant="body2">
                  {approved ? `Approved: ${approved}` : `Requested: ${requested}`}
                </Typography>
                {approved && approved !== requested && (
                  <Typography variant="caption" color="text.secondary">
                    Requested: {requested}
                  </Typography>
                )}
                <Typography variant="body2">Custodian: {reservation.custodianName}</Typography>
                {(reservation.overdue || reservation.reallocationWarning) && (
                  <Alert severity="warning">
                    {reservation.overdue ? "Overdue custody requires attention." : "Inventory changed; review this future allocation."}
                  </Alert>
                )}
                <LinkButton href={`/league/${data.league.id}/gear/reservations/${reservation.id}`} variant="outlined" sx={{ minHeight: 44 }}>
                  View reservation
                </LinkButton>
              </Stack>
            </Card>
            );
          })}
        </Stack>
      </Box>
      <Table size="small" sx={{ display: { xs: "none", md: "table" } }}>
        <TableHead>
          <TableRow>
            <TableCell>Team</TableCell>
            <TableCell>Dates</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Custody</TableCell>
            <TableCell align="right"> </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.reservations.map((reservation) => {
            const { requested, approved } = windows(reservation);
            return (
            <TableRow key={reservation.id}>
              <TableCell>{reservation.teamName}</TableCell>
              <TableCell>
                <Typography variant="body2">
                  {approved ? `Approved: ${approved}` : `Requested: ${requested}`}
                </Typography>
                {approved && approved !== requested && (
                  <Typography variant="caption" color="text.secondary">
                    Requested: {requested}
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip size="small" label={reservation.status.replace("_", " ")} color={statusColor[reservation.status]} />
                  {(reservation.overdue || reservation.reallocationWarning) && <Chip size="small" color="warning" label={reservation.overdue ? "Overdue" : "Review"} />}
                </Stack>
              </TableCell>
              <TableCell>{reservation.custodianName}</TableCell>
              <TableCell align="right">
                <LinkButton href={`/league/${data.league.id}/gear/reservations/${reservation.id}`} sx={{ minHeight: 44 }}>
                  Details
                </LinkButton>
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}
