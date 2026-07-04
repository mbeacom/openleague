import { Container, Stack, Typography } from "@mui/material";
import { prisma } from "@/lib/db/prisma";
import { requireUserId } from "@/lib/auth/session";
import { getProposalsForLeague, getProposalsForTeam } from "@/lib/actions/game-proposals";
import { getAvailableVenues } from "@/lib/actions/venues";
import {
  ProposalInbox,
  type ProposalInboxItem,
} from "@/components/features/seasons/ProposalInbox";
import type { GameProposalView } from "@/types/seasons";

export const dynamic = "force-dynamic";

/**
 * The viewer's capabilities for one proposal. Whose turn it is follows the
 * latest PROPOSE/COUNTER entry: only an admin of the side that did NOT author
 * it may accept/counter/decline (matching the server actions); either side's
 * admin may withdraw while the proposal is pending (FR-023).
 */
function buildItem(proposal: GameProposalView, adminTeamIds: Set<string>): ProposalInboxItem {
  let counterpartyId: string | null = null;
  for (let i = proposal.entries.length - 1; i >= 0; i -= 1) {
    const entry = proposal.entries[i];
    if (entry.kind === "PROPOSE" || entry.kind === "COUNTER") {
      counterpartyId =
        entry.actorTeamId === proposal.proposingTeam.id
          ? proposal.receivingTeam.id
          : proposal.proposingTeam.id;
      break;
    }
  }
  // getProposalsForTeam/League already flip lazily-expired proposals to EXPIRED.
  const pending = proposal.status === "PENDING" && !proposal.isExpired;
  return {
    proposal,
    canAct: pending && counterpartyId !== null && adminTeamIds.has(counterpartyId),
    canWithdraw:
      pending &&
      (adminTeamIds.has(proposal.proposingTeam.id) ||
        adminTeamIds.has(proposal.receivingTeam.id)),
    incoming: adminTeamIds.has(proposal.receivingTeam.id),
    outgoing: adminTeamIds.has(proposal.proposingTeam.id),
  };
}

export default async function ProposalsPage() {
  const userId = await requireUserId();

  // Teams the viewer administers that belong to a league — proposals are a
  // league-only workflow (FR-019).
  const memberships = await prisma.teamMember.findMany({
    where: {
      userId,
      role: "ADMIN",
      team: { isActive: true, leagueId: { not: null } },
    },
    select: { team: { select: { id: true, name: true, leagueId: true } } },
    orderBy: { team: { name: "asc" } },
  });
  const myTeams = memberships
    .map((membership) => membership.team)
    .filter((team): team is { id: string; name: string; leagueId: string } =>
      Boolean(team.leagueId)
    );
  const adminTeamIds = new Set(myTeams.map((team) => team.id));

  // Proposals sent or received by any of the viewer's teams, deduped — a
  // proposal between two of the viewer's own teams would otherwise repeat.
  // Fetched in parallel; Promise.all preserves team order for the dedupe.
  const teamProposals = new Map<string, GameProposalView>();
  const proposalsByTeam = await Promise.all(
    myTeams.map((team) => getProposalsForTeam(team.id))
  );
  for (const proposals of proposalsByTeam) {
    for (const proposal of proposals) {
      teamProposals.set(proposal.id, proposal);
    }
  }
  const items = [...teamProposals.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((proposal) => buildItem(proposal, adminTeamIds));

  // League-wide view for league administrators (FR-024).
  const leagueAdminRoles = await prisma.leagueUser.findMany({
    where: { userId, role: "LEAGUE_ADMIN" },
    select: { leagueId: true },
  });
  let leagueView: ProposalInboxItem[] | undefined;
  if (leagueAdminRoles.length > 0) {
    const leagueProposals = new Map<string, GameProposalView>();
    const proposalsByLeague = await Promise.all(
      leagueAdminRoles.map(({ leagueId }) => getProposalsForLeague(leagueId))
    );
    for (const proposals of proposalsByLeague) {
      for (const proposal of proposals) {
        leagueProposals.set(proposal.id, proposal);
      }
    }
    leagueView = [...leagueProposals.values()]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((proposal) => buildItem(proposal, adminTeamIds));
  }

  // Opponent options per league for the new-proposal form.
  const leagueIds = [...new Set(myTeams.map((team) => team.leagueId))];
  const leagueTeamRows = leagueIds.length
    ? await prisma.team.findMany({
        where: { leagueId: { in: leagueIds }, isActive: true },
        select: { id: true, name: true, leagueId: true },
        orderBy: { name: "asc" },
      })
    : [];
  const leagueTeams: Record<string, Array<{ id: string; name: string }>> = {};
  for (const team of leagueTeamRows) {
    if (!team.leagueId) continue;
    (leagueTeams[team.leagueId] ??= []).push({ id: team.id, name: team.name });
  }

  // Venues visible to the user (same listing as the season detail page).
  const venueRows = await getAvailableVenues();
  const venues = venueRows.map((venue) => ({
    id: venue.id,
    name: venue.name,
    timezone: venue.timezone,
  }));

  return (
    <Container maxWidth="md">
      <Stack spacing={3} sx={{ py: { xs: 3, md: 5 } }}>
        <Typography variant="h4" component="h1">
          Game proposals
        </Typography>
        <ProposalInbox
          items={items}
          leagueView={leagueView}
          myTeams={myTeams}
          leagueTeams={leagueTeams}
          venues={venues}
        />
      </Stack>
    </Container>
  );
}
