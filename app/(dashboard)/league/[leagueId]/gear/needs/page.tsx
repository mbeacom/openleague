import { AddOutlined } from "@mui/icons-material";
import { Button, MenuItem, Stack, TextField } from "@mui/material";
import { notFound } from "next/navigation";
import { GearNeedsList, type GearNeedListItem } from "@/components/features/gear/GearNeedsList";
import { LinkButton } from "@/components/ui/NextLinkComposites";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { getGearNeedsContext } from "@/lib/actions/gear-needs";

interface GearNeedsPageProps {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ status?: string; priority?: string; team?: string; from?: string }>;
}

export default async function GearNeedsPage({ params, searchParams }: GearNeedsPageProps) {
  const [{ leagueId }, filters] = await Promise.all([params, searchParams]);
  const context = await getGearNeedsContext(leagueId);
  if (!context) notFound();
  const needs = context.needs
    .filter((need) => !filters.status || need.status === filters.status)
    .filter((need) => !filters.priority || need.lines.some((line) => line.priority === filters.priority))
    .filter((need) => !filters.team || need.teamId === filters.team)
    .filter((need) => !filters.from || need.createdAt.slice(0, 10) >= filters.from)
    .map((need): GearNeedListItem => ({
      id: need.id,
      title: need.title,
      teamName: need.teamName,
      status: need.status,
      submittedAt: need.submittedAt,
      createdAt: need.createdAt,
      requestedQuantity: need.lines.reduce((total, line) => total + line.requestedQty, 0),
      fulfilledQuantity: need.lines.reduce((total, line) => total + line.fulfilledQty, 0),
      priority: need.lines.some((line) => line.priority === "URGENT") ? "URGENT"
        : need.lines.some((line) => line.priority === "HIGH") ? "HIGH"
          : need.lines.some((line) => line.priority === "NORMAL") ? "NORMAL" : "LOW",
    }));

  return (
    <PageContainer maxWidth="xl">
      <PageHeader
        title="Gear needs"
        subtitle="Team demand requests. Approving a need never reserves inventory."
        actions={context.teams.length > 0 ? (
          <LinkButton href={`/league/${leagueId}/gear/needs/new`} startIcon={<AddOutlined />} variant="contained" sx={{ minHeight: 44 }}>
            New need
          </LinkButton>
        ) : undefined}
      />
      <Stack component="form" direction={{ xs: "column", sm: "row" }} spacing={1} method="get" sx={{ mb: 2 }}>
        <TextField select name="team" label="Team" defaultValue={filters.team ?? ""} sx={{ minWidth: 180 }}>
          <MenuItem value="">All teams</MenuItem>
          {[...new Map(context.needs.map((need) => [need.teamId, need.teamName])).entries()].map(([teamId, teamName]) => (
            <MenuItem key={teamId} value={teamId}>{teamName}</MenuItem>
          ))}
        </TextField>
        <TextField select name="status" label="Status" defaultValue={filters.status ?? ""} sx={{ minWidth: 160 }}>
          <MenuItem value="">All statuses</MenuItem>
          {["DRAFT", "SUBMITTED", "APPROVED", "FULFILLED", "CANCELED"].map((status) => <MenuItem key={status} value={status}>{status}</MenuItem>)}
        </TextField>
        <TextField select name="priority" label="Priority" defaultValue={filters.priority ?? ""} sx={{ minWidth: 160 }}>
          <MenuItem value="">All priorities</MenuItem>
          {["LOW", "NORMAL", "HIGH", "URGENT"].map((priority) => <MenuItem key={priority} value={priority}>{priority}</MenuItem>)}
        </TextField>
        <TextField name="from" label="Created on or after" type="date" defaultValue={filters.from ?? ""} slotProps={{ inputLabel: { shrink: true } }} />
        <Button type="submit" variant="outlined" sx={{ minHeight: 44 }}>Filter</Button>
      </Stack>
      <GearNeedsList leagueId={leagueId} needs={needs} />
    </PageContainer>
  );
}
