import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { LinkMuiLink } from "@/components/ui/NextLinkComposites";
import type { AssociationOperationsData, OperationsAction } from "@/lib/data/association-operations";

type OperationalDashboardProps = {
  data: AssociationOperationsData | null;
  error?: string;
};

const sections: Array<[string, keyof AssociationOperationsData, string]> = [
  ["Pending ice requests", "pendingIceRequests", "Review requests"],
  ["Unassigned reservations", "unassignedReservations", "Assign activities"],
  ["Stale drafts", "staleDrafts", "Open schedule"],
  ["Unresolved conflicts", "unresolvedConflicts", "Resolve conflicts"],
  ["Migration overrides", "migrationOverrides", "Reconcile reservations"],
  ["Unscheduled teams", "unscheduledTeams", "Review schedule"],
  ["Phase gaps", "phaseGaps", "Review phases"],
  ["Upcoming assignments", "upcomingReservations", "View reservations"],
  ["Upcoming changes", "upcomingChanges", "View changes"],
];

function ActionList({ items }: { items: OperationsAction[] }) {
  if (!items.length) {
    return <Typography color="text.secondary" variant="body2">Nothing needs attention.</Typography>;
  }
  return (
    <Stack divider={<Divider flexItem />} spacing={0}>
      {items.slice(0, 5).map((item) => (
        <Box key={item.id} sx={{ py: 1 }}>
          <LinkMuiLink
            href={item.href}
            underline="hover"
            sx={{ display: "inline-flex", alignItems: "center", minHeight: 44, fontWeight: 600 }}
          >
            {item.title}
          </LinkMuiLink>
          {item.detail && <Typography color="text.secondary" variant="caption" display="block">{item.detail}</Typography>}
        </Box>
      ))}
    </Stack>
  );
}

export function OperationalDashboard({ data, error }: OperationalDashboardProps) {
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return <Alert severity="info">Operations data is not available.</Alert>;

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, gap: 2 }}>
        {[
          ["Needs attention", data.counts.pendingIceRequests + data.counts.unassignedReservations + data.counts.unresolvedConflicts],
          ["Schedule gaps", data.counts.unscheduledTeams + data.counts.phaseGaps],
          ["Gear", data.counts.urgentGearNeeds + data.counts.overdueGearCustody],
          ["Notifications", data.counts.outboxPending + data.counts.outboxFailed],
        ].map(([label, count]) => (
          <Card key={label} variant="outlined"><CardContent><Typography color="text.secondary" variant="body2">{label}</Typography><Typography variant="h4">{count}</Typography></CardContent></Card>
        ))}
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
        {sections.map(([title, key, action]) => {
          const items = data[key] as OperationsAction[];
          return (
            <Card key={title} variant="outlined">
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <Typography variant="h6">{title}</Typography>
                  <Chip label={items.length} size="small" color={items.length ? "warning" : "default"} />
                </Stack>
                <ActionList items={items} />
                {items.length > 5 && <Typography color="text.secondary" variant="caption">{action} to see all items.</Typography>}
              </CardContent>
            </Card>
          );
        })}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>Volunteer shortages</Typography>
            {data.volunteerShortages.length === 0 ? (
              <Typography color="text.secondary" variant="body2">
                Every open volunteer need is fully staffed.
              </Typography>
            ) : (
              <Stack spacing={1}>
                <Typography variant="body2">
                  {data.volunteerShortages.length} need(s) still short of volunteers
                </Typography>
                <ActionList items={data.volunteerShortages} />
              </Stack>
            )}
          </CardContent>
        </Card>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>Gear and notification health</Typography>
            <Stack spacing={1}>
              <Typography variant="body2">Urgent needs: {data.gear.urgentNeeds.length}</Typography>
              <Typography variant="body2">Overdue custody: {data.gear.overdueCustody.length}</Typography>
              <Typography variant="body2">Notification backlog: {data.gear.outbox.pending + data.gear.outbox.processing}</Typography>
              {data.gear.outbox.failed > 0 && <Alert severity="warning">Some notifications need retry attention.</Alert>}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Stack>
  );
}

export default OperationalDashboard;
