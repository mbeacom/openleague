import {
  Alert,
  Button,
  Card,
  Chip,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { VenueReservationAssignmentDialog } from "./VenueReservationAssignmentDialog";

export interface VenueReservationInventoryItem {
  id: string;
  venueName: string;
  localTime: string;
  space: string;
  owner: string;
  ownerType: "LEAGUE" | "TEAM";
  assignment: string | null;
  canAssign: boolean;
  practices: Array<{ id: string; title: string; teamName: string }>;
}

export interface VenueReservationFilters {
  assignment: "all" | "assigned" | "unassigned";
  owner: "all" | "league" | "team";
  venueId: string;
}

interface VenueReservationInventoryProps {
  leagueId: string;
  reservations: VenueReservationInventoryItem[];
  venues: Array<{ id: string; name: string }>;
  filters: VenueReservationFilters;
}

function AssignmentControl({
  reservation,
}: {
  reservation: VenueReservationInventoryItem;
}) {
  if (reservation.assignment) {
    return <Chip color="success" label="Assigned" size="small" />;
  }
  if (!reservation.canAssign) {
    return (
      <Stack spacing={0.5} alignItems={{ md: "flex-end" }}>
        <Chip label="Unassigned" size="small" variant="outlined" />
        <Typography variant="caption" color="text.secondary">
          Exact team admin required
        </Typography>
      </Stack>
    );
  }
  return (
    <VenueReservationAssignmentDialog
      reservationId={reservation.id}
      venueName={reservation.venueName}
      localTime={reservation.localTime}
      practices={reservation.practices}
    />
  );
}

export function VenueReservationInventory({
  leagueId,
  reservations,
  venues,
  filters,
}: VenueReservationInventoryProps) {
  return (
    <Stack spacing={3}>
      <Card
        component="form"
        action={`/league/${leagueId}/venue-reservations`}
        method="get"
        variant="outlined"
        sx={{ p: 2 }}
      >
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
          <TextField
            select
            name="assignment"
            label="Assignment"
            defaultValue={filters.assignment}
            fullWidth
            sx={{ "& .MuiInputBase-root": { minHeight: 44 } }}
          >
            <MenuItem value="all">All assignments</MenuItem>
            <MenuItem value="unassigned">Unassigned</MenuItem>
            <MenuItem value="assigned">Assigned</MenuItem>
          </TextField>
          <TextField
            select
            name="owner"
            label="Owner"
            defaultValue={filters.owner}
            fullWidth
            sx={{ "& .MuiInputBase-root": { minHeight: 44 } }}
          >
            <MenuItem value="all">All owners</MenuItem>
            <MenuItem value="league">Association owned</MenuItem>
            <MenuItem value="team">Team owned</MenuItem>
          </TextField>
          <TextField
            select
            name="venueId"
            label="Venue"
            defaultValue={filters.venueId}
            fullWidth
            sx={{ "& .MuiInputBase-root": { minHeight: 44 } }}
          >
            <MenuItem value="">All venues</MenuItem>
            {venues.map((venue) => (
              <MenuItem key={venue.id} value={venue.id}>
                {venue.name}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" spacing={1}>
            <Button type="submit" variant="contained" sx={{ minHeight: 44 }}>
              Apply
            </Button>
            <LinkButton
              href={`/league/${leagueId}/venue-reservations`}
              variant="outlined"
              sx={{ minHeight: 44 }}
            >
              Reset
            </LinkButton>
          </Stack>
        </Stack>
      </Card>

      {reservations.length === 0 ? (
        <Alert severity="info">No confirmed venue reservations match these filters.</Alert>
      ) : (
        <>
          <Stack spacing={2} sx={{ display: { xs: "flex", md: "none" } }}>
            {reservations.map((reservation) => (
              <Card key={reservation.id} variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1.5}>
                  <Stack direction="row" justifyContent="space-between" spacing={1}>
                    <Typography fontWeight={700}>{reservation.venueName}</Typography>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={reservation.ownerType === "LEAGUE" ? "Association" : "Team"}
                    />
                  </Stack>
                  <Typography variant="body2">{reservation.localTime}</Typography>
                  <Typography variant="body2">Space: {reservation.space}</Typography>
                  <Typography variant="body2">Owner: {reservation.owner}</Typography>
                  {reservation.assignment ? (
                    <Typography variant="body2">Assigned to: {reservation.assignment}</Typography>
                  ) : null}
                  <AssignmentControl reservation={reservation} />
                </Stack>
              </Card>
            ))}
          </Stack>

          <TableContainer
            component={Card}
            variant="outlined"
            sx={{ display: { xs: "none", md: "block" } }}
          >
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Venue / local time</TableCell>
                  <TableCell>Surface / segment</TableCell>
                  <TableCell>Owner</TableCell>
                  <TableCell>Assignment</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reservations.map((reservation) => (
                  <TableRow key={reservation.id}>
                    <TableCell>
                      <Typography fontWeight={700}>{reservation.venueName}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {reservation.localTime}
                      </Typography>
                    </TableCell>
                    <TableCell>{reservation.space}</TableCell>
                    <TableCell>
                      <Typography variant="body2">{reservation.owner}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {reservation.ownerType === "LEAGUE" ? "Association" : "Team"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {reservation.assignment ?? (
                        <Typography color="text.secondary">Unassigned</Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <AssignmentControl reservation={reservation} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Stack>
  );
}
