import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockRespond, mockComplete, mockMissed, mockCreateNeed, mockAssign } = vi.hoisted(() => ({
  mockRespond: vi.fn(),
  mockComplete: vi.fn(),
  mockMissed: vi.fn(),
  mockCreateNeed: vi.fn(),
  mockAssign: vi.fn(),
}));

vi.mock("@/lib/actions/volunteers", () => ({
  respondToVolunteerAssignment: mockRespond,
  completeVolunteerAssignment: mockComplete,
  markVolunteerAssignmentMissed: mockMissed,
  createVolunteerNeed: mockCreateNeed,
  assignVolunteer: mockAssign,
}));

import VolunteerBoard from "@/components/features/workforce/VolunteerBoard";
import RoleGrantManager from "@/components/features/workforce/RoleGrantManager";

const { mockInvite, mockRevoke } = vi.hoisted(() => ({
  mockInvite: vi.fn(),
  mockRevoke: vi.fn(),
}));

vi.mock("@/lib/actions/association-roles", () => ({
  inviteAssociationOperator: mockInvite,
  revokeAssociationResponsibility: mockRevoke,
}));

const need = {
  id: "need-1",
  roleLabel: "Scorekeeper",
  description: "Operate the clock",
  capacity: 2,
  acceptedCount: 1,
  status: "OPEN",
  startAt: new Date("2027-01-01T18:00:00Z"),
  endAt: new Date("2027-01-01T20:00:00Z"),
  timezone: "America/Chicago",
  teamName: "Metro Blades",
  assignments: [
    { id: "assign-1", status: "INVITED", personLabel: "Sam Rivera" },
  ],
};

describe("VolunteerBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRespond.mockResolvedValue({ success: true, data: { status: "ACCEPTED" } });
    mockComplete.mockResolvedValue({ success: true, data: { id: "assign-1" } });
  });

  it("shows staffing progress and the shortfall to an organizer", () => {
    render(<VolunteerBoard needs={[need]} isOrganizer />);

    expect(screen.getByText("Scorekeeper")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 filled")).toBeInTheDocument();
    expect(screen.getByText("1 more volunteer needed")).toBeInTheDocument();
  });

  it("offers accept and decline to a volunteer, not organizer controls", async () => {
    render(<VolunteerBoard needs={[need]} isOrganizer={false} />);

    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "No-show" })).not.toBeInTheDocument();
  });

  it("sends the volunteer's acceptance", async () => {
    const user = userEvent.setup();
    render(<VolunteerBoard needs={[need]} isOrganizer={false} />);

    await user.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(mockRespond).toHaveBeenCalledWith({
        assignmentId: "assign-1",
        response: "ACCEPTED",
      });
    });
  });

  it("surfaces a full need rather than failing silently", async () => {
    mockRespond.mockResolvedValue({ success: false, error: "That volunteer need is already full." });
    const user = userEvent.setup();
    render(<VolunteerBoard needs={[need]} isOrganizer={false} />);

    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(await screen.findByText("That volunteer need is already full.")).toBeInTheDocument();
  });

  it("offers close-out controls to an organizer for accepted assignments only", () => {
    const accepted = {
      ...need,
      assignments: [{ id: "assign-2", status: "ACCEPTED", personLabel: "Sam Rivera" }],
    };

    render(<VolunteerBoard needs={[accepted]} isOrganizer />);

    expect(screen.getByRole("button", { name: "Completed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No-show" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
  });

  it("tells a volunteer with no shifts that there is nothing to do", () => {
    render(<VolunteerBoard needs={[]} isOrganizer={false} />);

    expect(screen.getByText("You have no volunteer shifts right now.")).toBeInTheDocument();
  });
});

describe("RoleGrantManager", () => {
  const grants = [
    {
      id: "grant-1",
      role: "EQUIPMENT_MANAGER" as const,
      scopeType: "TEAM" as const,
      scopeLabel: "Metro Blades",
      user: { id: "u1", name: "Alex Chen", email: "alex@example.com" },
      createdAt: new Date("2026-01-01"),
    },
  ];

  const props = {
    leagueId: "league-1",
    grants,
    divisions: [{ id: "div-1", name: "U12 Recreational" }],
    teams: [{ id: "team-1", name: "Metro Blades" }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvite.mockResolvedValue({ success: true, data: { invitationId: "inv-1" } });
    mockRevoke.mockResolvedValue({ success: true, data: { id: "grant-1" } });
  });

  it("lists current responsibilities with their scope", () => {
    render(<RoleGrantManager {...props} />);

    expect(screen.getByText("Alex Chen")).toBeInTheDocument();
    expect(screen.getByText("Equipment manager")).toBeInTheDocument();
    expect(screen.getByText("Metro Blades")).toBeInTheDocument();
  });

  it("explains what the selected role actually confers", async () => {
    render(<RoleGrantManager {...props} />);

    // Default selection is Team manager. The guidance states what the grant
    // does *today* — volunteers and gear — and is explicit that roster and
    // practice administration still follow team admin membership, so nobody
    // delegates expecting more than they get.
    expect(screen.getByText(/Volunteers and gear needs\/requests for one team/)).toBeInTheDocument();
    expect(screen.getByText(/still follow team admin membership/)).toBeInTheDocument();
  });

  it("does not offer roles whose work is not yet routed through grants", async () => {
    const user = userEvent.setup();
    render(<RoleGrantManager {...props} />);

    await user.click(screen.getByRole("combobox", { name: /Responsibility/i }));

    // Offered: the roles a grant actually empowers.
    expect(screen.getByRole("option", { name: "Equipment manager" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Volunteer coordinator" })).toBeInTheDocument();
    // Withheld: scheduling, registration, finance, communications, and event
    // administration still guard on legacy roles, so a grant would do nothing.
    for (const withheld of ["Scheduler", "Registrar", "Treasurer", "Communications lead", "Coach", "Event manager"]) {
      expect(screen.queryByRole("option", { name: withheld })).not.toBeInTheDocument();
    }
  });

  it("warns that equipment managers get gear only", async () => {
    const user = userEvent.setup();
    render(<RoleGrantManager {...props} />);

    await user.click(screen.getByRole("combobox", { name: /Responsibility/i }));
    await user.click(screen.getByRole("option", { name: "Equipment manager" }));

    expect(
      await screen.findByText(/Confers no scheduling, finance, or administrative access/),
    ).toBeInTheDocument();
  });

  it("only offers scopes the chosen role supports", async () => {
    const user = userEvent.setup();
    render(<RoleGrantManager {...props} />);

    await user.click(screen.getByRole("combobox", { name: /Responsibility/i }));
    await user.click(screen.getByRole("option", { name: "Association admin" }));

    await user.click(screen.getByRole("combobox", { name: /Scope/i }));

    // Association admin is association-only; offering a team scope would build
    // a combination the server refuses.
    expect(screen.getByRole("option", { name: "Entire association" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "One team" })).not.toBeInTheDocument();
  });

  it("never offers a scope the form cannot supply a target for", async () => {
    const user = userEvent.setup();
    render(<RoleGrantManager {...props} />);

    await user.click(screen.getByRole("combobox", { name: /Responsibility/i }));
    await user.click(screen.getByRole("option", { name: "Volunteer coordinator" }));
    await user.click(screen.getByRole("combobox", { name: /Scope/i }));

    // The matrix allows season and event scope for this role, but the form has
    // no picker for them, so selecting one would always be rejected server-side.
    for (const unsupported of ["One season", "One event", "One signup event"]) {
      expect(screen.queryByRole("option", { name: unsupported })).not.toBeInTheDocument();
    }
  });

  it("revokes a responsibility", async () => {
    const user = userEvent.setup();
    render(<RoleGrantManager {...props} />);

    await user.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => {
      expect(mockRevoke).toHaveBeenCalledWith({ grantId: "grant-1", leagueId: "league-1" });
    });
  });

  it("surfaces a server refusal", async () => {
    mockInvite.mockResolvedValue({
      success: false,
      error: "TREASURER cannot be granted at TEAM scope.",
    });
    const user = userEvent.setup();
    render(<RoleGrantManager {...props} />);

    await user.type(screen.getByLabelText(/Email address/i), "new@example.com");
    await user.click(screen.getByRole("combobox", { name: /Team$/i }));
    await user.click(screen.getByRole("option", { name: "Metro Blades" }));
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(
      await screen.findByText("TREASURER cannot be granted at TEAM scope."),
    ).toBeInTheDocument();
  });
});
