import { Alert, Box, Card, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { LinkButton } from "@/components/ui/NextLinkComposites";

export type GearNeedListItem = {
  id: string;
  title: string;
  teamName: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "FULFILLED" | "CANCELED";
  submittedAt: string | null;
  createdAt: string;
  requestedQuantity: number;
  fulfilledQuantity: number;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
};

const statusColor = {
  DRAFT: "default",
  SUBMITTED: "warning",
  APPROVED: "info",
  FULFILLED: "success",
  CANCELED: "default",
} as const;

const priorityColor = {
  LOW: "default",
  NORMAL: "default",
  HIGH: "warning",
  URGENT: "error",
} as const;

export function GearNeedsList({
  leagueId,
  needs,
}: {
  leagueId: string;
  needs: GearNeedListItem[];
}) {
  if (needs.length === 0) {
    return <Alert severity="info">No gear needs match these filters. Needs describe future demand and never reserve inventory.</Alert>;
  }

  return (
    <>
      <Box sx={{ display: { xs: "block", md: "none" } }}>
        <Stack spacing={2}>
          {needs.map((need) => (
            <Card key={need.id} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                  <Typography fontWeight={700}>{need.title}</Typography>
                  <Chip size="small" label={need.status} color={statusColor[need.status]} />
                </Stack>
                <Typography variant="body2">{need.teamName}</Typography>
                <Stack direction="row" spacing={1}>
                  <Chip size="small" label={need.priority} color={priorityColor[need.priority]} variant="outlined" />
                  <Typography variant="body2" color="text.secondary">
                    {need.fulfilledQuantity} of {need.requestedQuantity} fulfilled
                  </Typography>
                </Stack>
                <LinkButton href={`/league/${leagueId}/gear/needs/${need.id}`} variant="outlined" sx={{ minHeight: 44 }}>
                  View need
                </LinkButton>
              </Stack>
            </Card>
          ))}
        </Stack>
      </Box>
      <Table size="small" sx={{ display: { xs: "none", md: "table" } }}>
        <TableHead>
          <TableRow>
            <TableCell>Need</TableCell>
            <TableCell>Team</TableCell>
            <TableCell>Priority</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Progress</TableCell>
            <TableCell align="right"> </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {needs.map((need) => (
            <TableRow key={need.id}>
              <TableCell>{need.title}</TableCell>
              <TableCell>{need.teamName}</TableCell>
              <TableCell><Chip size="small" label={need.priority} color={priorityColor[need.priority]} variant="outlined" /></TableCell>
              <TableCell><Chip size="small" label={need.status} color={statusColor[need.status]} /></TableCell>
              <TableCell>{need.fulfilledQuantity} / {need.requestedQuantity}</TableCell>
              <TableCell align="right">
                <LinkButton href={`/league/${leagueId}/gear/needs/${need.id}`} sx={{ minHeight: 44 }}>
                  Details
                </LinkButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
