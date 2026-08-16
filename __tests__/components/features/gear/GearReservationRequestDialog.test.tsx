import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createGearReservation, refresh } = vi.hoisted(() => ({
  createGearReservation: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/actions/gear-reservations", () => ({ createGearReservation }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { GearReservationRequestDialog } from "@/components/features/gear/GearReservationRequestDialog";
import type { GearReservationContext } from "@/lib/actions/gear-context";

const LEAGUE_ID = "cllllllllllllllllllllllll";
const TEAM_ID = "cteeeeeeeeeeeeeeeeeeeeeee";
const CATALOG_ITEM_ID = "ccatalogiiiiiiiiiiiiiiiii";

function context(): GearReservationContext {
  return {
    league: { id: LEAGUE_ID, name: "Metro" },
    canManageReservations: false,
    canRequestReservations: true,
    teamIds: [TEAM_ID],
    requestableTeams: [{ id: TEAM_ID, name: "Owning team" }],
    catalogItems: [{ id: CATALOG_ITEM_ID, name: "Helmet", trackingMode: "POOLED" }],
    reservations: [],
  } as unknown as GearReservationContext;
}

function openDialog() {
  render(<GearReservationRequestDialog data={context()} />);
  fireEvent.click(screen.getByRole("button", { name: /request gear/i }));
}

function fillRequiredFields({ start = "2027-01-01", end = "2027-01-03", email = "" } = {}) {
  fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: start } });
  fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: end } });
  fireEvent.change(screen.getByLabelText(/custodian name/i), { target: { value: "Team custodian" } });
  if (email) fireEvent.change(screen.getByLabelText(/custodian email/i), { target: { value: email } });
}

const submit = () => fireEvent.click(screen.getByRole("button", { name: /submit request/i }));

describe("GearReservationRequestDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createGearReservation.mockResolvedValue({ success: true, data: { id: "crrrrrrrrrrrrrrrrrrrrrrrr" } });
  });

  it("blocks submission client-side when the dates are missing", async () => {
    openDialog();
    submit();

    await waitFor(() => expect(screen.getByText(/Fix the highlighted fields/)).toBeInTheDocument());
    expect(screen.getAllByText("Date must be YYYY-MM-DD").length).toBeGreaterThan(0);
    expect(createGearReservation).not.toHaveBeenCalled();
  });

  it("rejects an end date that precedes the start date without calling the server", async () => {
    openDialog();
    fillRequiredFields({ start: "2027-01-05", end: "2027-01-01" });
    submit();

    await waitFor(() =>
      expect(screen.getByText("Reservation end date must be on or after the start date")).toBeInTheDocument());
    expect(createGearReservation).not.toHaveBeenCalled();
  });

  it("rejects a malformed custodian email client-side", async () => {
    openDialog();
    fillRequiredFields({ email: "not-an-email" });
    submit();

    await waitFor(() => expect(screen.getByText("Invalid email address")).toBeInTheDocument());
    expect(createGearReservation).not.toHaveBeenCalled();
  });

  it("maps server field issues back onto the inputs that produced them", async () => {
    createGearReservation.mockResolvedValue({
      success: false,
      error: "Please correct the highlighted fields.",
      details: [{ path: ["lines", 0, "requestedQty"], message: "Quantity must be at least 1" }],
    });
    openDialog();
    fillRequiredFields();
    submit();

    await waitFor(() => expect(createGearReservation).toHaveBeenCalled());
    expect(await screen.findByText("Quantity must be at least 1")).toBeInTheDocument();
    expect(screen.getByText("Please correct the highlighted fields.")).toBeInTheDocument();
  });

  it("submits a sanitized payload and refreshes on success", async () => {
    openDialog();
    fillRequiredFields({ email: "custodian@example.com" });
    fireEvent.click(screen.getByRole("button", { name: /add another item/i }));
    const quantities = screen.getAllByRole("spinbutton");
    fireEvent.change(quantities[1], { target: { value: "3" } });
    submit();

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(createGearReservation).toHaveBeenCalledWith(expect.objectContaining({
      leagueId: LEAGUE_ID,
      teamId: TEAM_ID,
      requestedStartDate: "2027-01-01",
      requestedEndDate: "2027-01-03",
      custodianEmailSnapshot: "custodian@example.com",
      lines: [
        { catalogItemId: CATALOG_ITEM_ID, nameSnapshot: "Helmet", requestedQty: "1" },
        { catalogItemId: CATALOG_ITEM_ID, nameSnapshot: "Helmet", requestedQty: "3" },
      ],
    }));
  });
});
