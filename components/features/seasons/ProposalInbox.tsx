"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  Chip,
  Link as MuiLink,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AddIcon from "@mui/icons-material/Add";
import type { GameProposalStatus } from "@prisma/client";
import { ProposalForm, type ProposalFormTeam } from "./ProposalForm";
import { ProposalThread } from "./ProposalThread";
import type { GameProposalView } from "@/types/seasons";

const STATUS_CHIPS: Record<
  GameProposalStatus,
  { label: string; color: "default" | "success" | "warning" | "error" }
> = {
  PENDING: { label: "Pending", color: "warning" },
  ACCEPTED: { label: "Accepted", color: "success" },
  DECLINED: { label: "Declined", color: "error" },
  WITHDRAWN: { label: "Withdrawn", color: "default" },
  EXPIRED: { label: "Expired", color: "default" },
};

/** A proposal plus the viewer's server-computed capabilities for it. */
export interface ProposalInboxItem {
  proposal: GameProposalView;
  /** Viewer administers the side whose turn it is (may accept/counter/decline). */
  canAct: boolean;
  /** Viewer administers either side and the proposal is still pending. */
  canWithdraw: boolean;
  /** Viewer administers the receiving team. */
  incoming: boolean;
  /** Viewer administers the proposing team. */
  outgoing: boolean;
}

interface ProposalInboxProps {
  items: ProposalInboxItem[];
  /** Every proposal in the viewer's leagues (FR-024) — enables the third tab. */
  leagueView?: ProposalInboxItem[];
  /** Teams the viewer administers — the proposing side of new proposals. */
  myTeams: ProposalFormTeam[];
  /** Active teams per league, for the opponent picker. */
  leagueTeams: Record<string, Array<{ id: string; name: string }>>;
  venues: Array<{ id: string; name: string; timezone: string }>;
}

// Proposal terms carry no timezone — render in the viewer's local zone.
const formatWhen = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));

/** Current terms live on the latest PROPOSE/COUNTER entry (entries are ordered). */
const latestTermsStart = (proposal: GameProposalView): Date | null => {
  for (let i = proposal.entries.length - 1; i >= 0; i -= 1) {
    const entry = proposal.entries[i];
    if ((entry.kind === "PROPOSE" || entry.kind === "COUNTER") && entry.startAt) {
      return entry.startAt;
    }
  }
  return null;
};

/**
 * Game proposal inbox: incoming/outgoing tabs for team admins, plus an
 * all-league tab for league administrators (FR-024). Each proposal expands
 * into its full negotiation thread.
 */
export function ProposalInbox({
  items,
  leagueView,
  myTeams,
  leagueTeams,
  venues,
}: ProposalInboxProps) {
  const [tab, setTab] = useState(0);
  const [formOpen, setFormOpen] = useState(false);

  const tabs: Array<{ label: string; items: ProposalInboxItem[]; empty: string }> = [
    {
      label: "Incoming",
      items: items.filter((item) => item.incoming),
      empty: "No incoming proposals. When another team proposes a game, it appears here.",
    },
    {
      label: "Outgoing",
      items: items.filter((item) => item.outgoing),
      empty: "No outgoing proposals yet. Propose a game to get one on the calendar.",
    },
    ...(leagueView
      ? [
          {
            label: "All league",
            items: leagueView,
            empty: "No proposals in your league yet.",
          },
        ]
      : []),
  ];
  const active = tabs[Math.min(tab, tabs.length - 1)];

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        justifyContent="space-between"
        alignItems={{ sm: "center" }}
      >
        <Tabs
          value={Math.min(tab, tabs.length - 1)}
          onChange={(_event, value: number) => setTab(value)}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          {tabs.map((entry) => (
            <Tab key={entry.label} label={entry.label} sx={{ minHeight: 44 }} />
          ))}
        </Tabs>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          disabled={myTeams.length === 0}
          onClick={() => setFormOpen(true)}
          sx={{ minHeight: 44 }}
        >
          New proposal
        </Button>
      </Stack>

      {myTeams.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Game proposals are a league workflow: to propose or receive games, you
          need to be an admin of a team that belongs to an active league. Visit{" "}
          <MuiLink component={Link} href="/league">
            the leagues page
          </MuiLink>{" "}
          to join or create one.
        </Typography>
      ) : null}

      {active.items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {active.empty}
        </Typography>
      ) : (
        <Stack>
          {active.items.map(({ proposal, canAct, canWithdraw }) => {
            const status = proposal.isExpired ? "EXPIRED" : proposal.status;
            const start = latestTermsStart(proposal);
            return (
              <Accordion key={proposal.id} disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 44 }}>
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    flexWrap="wrap"
                    useFlexGap
                    sx={{ pr: 1 }}
                  >
                    <Chip
                      size="small"
                      label={STATUS_CHIPS[status].label}
                      color={STATUS_CHIPS[status].color}
                    />
                    <Typography variant="subtitle2">
                      {proposal.proposingTeam.name} vs {proposal.receivingTeam.name}
                    </Typography>
                    {start ? (
                      <Typography variant="body2" color="text.secondary">
                        {formatWhen(start)}
                      </Typography>
                    ) : null}
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <ProposalThread
                    proposal={proposal}
                    canAct={canAct}
                    canWithdraw={canWithdraw}
                    venues={venues}
                  />
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Stack>
      )}

      <ProposalForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        myTeams={myTeams}
        leagueTeams={leagueTeams}
        venues={venues}
      />
    </Stack>
  );
}
