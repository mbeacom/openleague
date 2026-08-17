import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GearNeedActions } from "@/components/features/gear/GearNeedActions";
import { GearNeedCreateForm } from "@/components/features/gear/GearNeedCreateForm";
import { GearPledgeAdminActions } from "@/components/features/gear/GearPledgeAdminActions";
import { GearWishlistEditor } from "@/components/features/gear/GearWishlistEditor";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  cancelNeed: vi.fn().mockResolvedValue({ success: true }),
  declinePledge: vi.fn().mockResolvedValue({ success: true }),
  expirePledge: vi.fn().mockResolvedValue({ success: true }),
  correctReceipt: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/actions/gear-needs", () => ({
  cancelTeamGearNeed: mocks.cancelNeed,
  submitTeamGearNeed: vi.fn(),
  approveTeamGearNeed: vi.fn(),
  fulfillTeamGearNeed: vi.fn(),
  createTeamGearNeed: vi.fn(),
}));
vi.mock("@/lib/actions/gear-pledges", () => ({
  declineGearPledge: mocks.declinePledge,
  expireGearPledge: mocks.expirePledge,
  correctGearPledgeReceipt: mocks.correctReceipt,
  receiveGearPledge: vi.fn(),
}));
vi.mock("@/lib/actions/gear-wishlist", () => ({ saveGearWishlist: vi.fn() }));

describe("gear workflow admin UI", () => {
  it("uses named team options rather than opaque IDs", () => {
    render(<GearNeedCreateForm leagueId="league-1" teams={[{ id: "team-cuid", name: "U12 Comets" }]} />);

    expect(screen.getByText("U12 Comets")).toBeInTheDocument();
    expect(screen.queryByText("team-cuid")).not.toBeInTheDocument();
  });

  it("renders only granted need operations and refreshes after a transition", async () => {
    mocks.refresh.mockClear();
    render(
      <GearNeedActions
        leagueId="league-1"
        needId="need-1"
        expectedVersion={3}
        status="SUBMITTED"
        capabilities={{ canSubmit: false, canCancel: true, canApprove: false, canFulfill: false }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Approve need" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel need" }));

    await waitFor(() => expect(mocks.cancelNeed).toHaveBeenCalledWith({
      leagueId: "league-1", needId: "need-1", expectedVersion: 3,
    }));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("wires private pledge decline with the version guard", async () => {
    mocks.refresh.mockClear();
    mocks.declinePledge.mockClear();
    render(
      <GearPledgeAdminActions
        leagueId="league-1"
        pledgeId="pledge-1"
        pledgeVersion={4}
        status="PLEDGED"
        catalogItems={[]}
        pooledCatalogItems={[]}
        locations={[]}
        poolStock={[]}
        remainingQuantity={1}
        receipts={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Decline pledge" }));
    await waitFor(() => expect(mocks.declinePledge).toHaveBeenCalledWith({
      leagueId: "league-1", pledgeId: "pledge-1", expectedVersion: 4,
    }));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("provides a first-campaign editor when no wishlist exists", () => {
    render(<GearWishlistEditor leagueId="league-1" catalogItems={[]} />);

    expect(screen.getByRole("button", { name: "Save draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save and publish" })).toBeInTheDocument();
  });
});
