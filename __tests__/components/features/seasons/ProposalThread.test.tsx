import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAcceptGameProposal, mockRefresh } = vi.hoisted(() => ({
  mockAcceptGameProposal: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));
vi.mock("@/lib/actions/game-proposals", () => ({
  acceptGameProposal: (...args: unknown[]) => mockAcceptGameProposal(...args),
  counterGameProposal: vi.fn(),
  declineGameProposal: vi.fn(),
  withdrawGameProposal: vi.fn(),
}));

import { ProposalThread } from "@/components/features/seasons/ProposalThread";

const startAt = new Date("2027-01-10T18:00:00.000Z");
const endAt = new Date("2027-01-10T19:30:00.000Z");

const proposal = {
  id: "clproposal000000000001",
  status: "PENDING" as const,
  leagueId: "clleague0000000000000001",
  proposingTeam: { id: "clteam00000000000000001", name: "Arrows" },
  receivingTeam: { id: "clteam00000000000000002", name: "Blizzards" },
  seasonId: "clseason000000000000001",
  createdAt: new Date("2026-12-01T00:00:00.000Z"),
  resolvedAt: null,
  entries: [{
    id: "clentry00000000000000001",
    kind: "PROPOSE" as const,
    startAt,
    endAt,
    venue: { id: "clvenue00000000000000001", name: "North Rink" },
    venueReservationId: null,
    note: null,
    actorTeamId: "clteam00000000000000001",
    createdAt: new Date("2026-12-01T00:00:00.000Z"),
  }],
  resultingGameId: null,
  isExpired: false,
};

const reservations = [{
  id: "clreservation0000000001",
  venueId: "clvenue00000000000000001",
  startsAt: startAt,
  endsAt: endAt,
  venueName: "North Rink",
  surfaceName: "Main",
  segmentName: null,
  proposalId: null,
  ownerLeagueId: proposal.leagueId,
  ownerTeamId: null,
}];

describe("ProposalThread reservation assignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAcceptGameProposal.mockResolvedValue({
      success: true,
      data: { gameId: "clgame000000000000000001" },
    });
  });

  it("requires and submits confirmed matching inventory for normal acceptance", async () => {
    const user = userEvent.setup();
    render(
      <ProposalThread
        proposal={proposal}
        canAct
        canWithdraw
        venues={[{ id: reservations[0].venueId, name: "North Rink", timezone: "UTC" }]}
        reservations={reservations}
      />,
    );

    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
    await user.click(screen.getByRole("combobox", { name: "Confirmed venue reservation" }));
    await user.click(screen.getByRole("option", { name: /North Rink · Main/ }));
    await user.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => expect(mockAcceptGameProposal).toHaveBeenCalledWith({
      proposalId: proposal.id,
      reservationId: reservations[0].id,
      overrideConflicts: false,
      overrideReason: undefined,
    }));
  });

  it("keeps conflict override explicit and reasoned", async () => {
    const user = userEvent.setup();
    mockAcceptGameProposal
      .mockResolvedValueOnce({
        success: false,
        error: "Conflict",
        details: {
          conflicts: [{
            source: "seasonGame",
            title: "Existing game",
            startAt,
            endAt,
            surfaceId: null,
            segmentId: null,
            segmentName: null,
          }],
        },
      })
      .mockResolvedValueOnce({ success: true, data: { gameId: "game-1" } });
    render(
      <ProposalThread
        proposal={proposal}
        canAct
        canWithdraw
        venues={[{ id: reservations[0].venueId, name: "North Rink", timezone: "UTC" }]}
        reservations={reservations}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Confirmed venue reservation" }));
    await user.click(screen.getByRole("option", { name: /North Rink · Main/ }));
    await user.click(screen.getByRole("button", { name: "Accept" }));
    const overrideButton = await screen.findByRole("button", { name: "Accept anyway" });
    expect(overrideButton).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Override reason" }), "Venue approved");
    await user.click(overrideButton);

    await waitFor(() => expect(mockAcceptGameProposal).toHaveBeenLastCalledWith({
      proposalId: proposal.id,
      reservationId: reservations[0].id,
      overrideConflicts: true,
      overrideReason: "Venue approved",
    }));
  });

  it("does not offer inventory owned outside the two proposal teams", () => {
    render(
      <ProposalThread
        proposal={proposal}
        canAct
        canWithdraw
        venues={[{ id: reservations[0].venueId, name: "North Rink", timezone: "UTC" }]}
        reservations={[{
          ...reservations[0],
          ownerLeagueId: null,
          ownerTeamId: "clteam00000000000000003",
        }]}
      />,
    );

    expect(screen.getByText(
      "No confirmed unassigned reservation matches these terms.",
    )).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
  });

  it("does not trust a held reservation omitted by the scoped inventory query", () => {
    render(
      <ProposalThread
        proposal={{
          ...proposal,
          entries: [{
            ...proposal.entries[0],
            venueReservationId: "clreservation0000000009",
          }],
        }}
        canAct
        canWithdraw
        venues={[{ id: reservations[0].venueId, name: "North Rink", timezone: "UTC" }]}
        reservations={[]}
      />,
    );

    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
  });
});
