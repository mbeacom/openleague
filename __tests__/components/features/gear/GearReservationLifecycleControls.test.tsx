import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GearReservationLifecycleControls } from "@/components/features/gear/GearReservationLifecycleControls";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  approve: vi.fn(),
  options: vi.fn(),
  pickup: vi.fn(),
  release: vi.fn(),
  returnGear: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/actions/gear-reservations", () => ({
  approveAndAllocateGearReservation: mocks.approve,
  cancelGearReservation: vi.fn(),
  declineGearReservation: vi.fn(),
  getGearReservationAllocationOptions: mocks.options,
  recordGearPickup: mocks.pickup,
  recordGearReturn: mocks.returnGear,
  releaseGearAllocation: mocks.release,
}));

type Props = Parameters<typeof GearReservationLifecycleControls>[0];
type Allocation = Props["reservation"]["allocations"][number];

function allocation(overrides: Partial<Allocation>): Allocation {
  return {
    id: "alloc-1",
    status: "ALLOCATED",
    allocatedQty: 1,
    pickedUpQty: 0,
    returnedQty: 0,
    releasedQty: 0,
    outstandingQty: 0,
    poolStockId: "pool-1",
    gearUnitId: null,
    assetTag: null,
    locationName: "Rink Storage Room",
    effectiveStartDate: "2026-11-20T00:00:00.000Z",
    effectiveEndDate: "2026-11-21T00:00:00.000Z",
    overdue: false,
    version: 1,
    capabilities: { canRecordPickup: true, canRelease: true, canRecordReturn: false },
    ...overrides,
  } as Allocation;
}

function reservation(overrides: Partial<Props["reservation"]> = {}): Props["reservation"] {
  return {
    id: "res-1",
    teamId: "team-1",
    teamName: "Metro Blades",
    status: "APPROVED",
    requestedStartDate: "2026-11-20T00:00:00.000Z",
    requestedEndDate: "2026-11-21T00:00:00.000Z",
    approvedStartDate: "2026-11-20T00:00:00.000Z",
    approvedEndDate: "2026-11-21T00:00:00.000Z",
    custodianName: "Coach",
    requestNotes: null,
    version: 4,
    capabilities: { canApproveAndAllocate: false, canDecline: false, canReschedule: false, canCancel: false },
    overdue: false,
    reallocationWarning: false,
    lines: [{ id: "line-1", catalogItemId: "item-1", name: "Practice pylons", requestedQty: 8, approvedQty: 8, allocatedQty: 8 }],
    allocations: [],
    ...overrides,
  } as Props["reservation"];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.options.mockResolvedValue({
    success: true,
    data: [{ value: "pool:pool-1", label: "Rink Storage Room (13 available)", maxQuantity: 13 }],
  });
});

describe("GearReservationLifecycleControls", () => {
  it("labels each pooled allocation's buttons with the quantity they act on", () => {
    render(
      <GearReservationLifecycleControls
        leagueId="league-1"
        reservation={reservation({
          allocations: [
            allocation({ id: "a1", allocatedQty: 1 }),
            allocation({ id: "a2", allocatedQty: 7 }),
          ],
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Confirm pickup (Rink Storage Room, 1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm pickup (Rink Storage Room, 7)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Release (Rink Storage Room, 7)" })).toBeInTheDocument();
  });

  it("labels a return with the outstanding quantity and a tagged unit by its tag", () => {
    render(
      <GearReservationLifecycleControls
        leagueId="league-1"
        reservation={reservation({
          allocations: [
            allocation({
              id: "a1", status: "PARTIALLY_RETURNED", allocatedQty: 7, pickedUpQty: 7, returnedQty: 2, outstandingQty: 5,
              capabilities: { canRecordPickup: false, canRelease: false, canRecordReturn: true },
            } as Partial<Allocation>),
            allocation({ id: "a2", assetTag: "NET-04", gearUnitId: "unit-4", poolStockId: null }),
          ],
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Record return (Rink Storage Room, 5)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm pickup (NET-04)" })).toBeInTheDocument();
  });

  it("explains an over-limit quantity inside the allocate dialog and blocks the save", async () => {
    render(
      <GearReservationLifecycleControls
        leagueId="league-1"
        reservation={reservation({
          status: "REQUESTED",
          capabilities: { canApproveAndAllocate: true, canDecline: false, canReschedule: false, canCancel: false },
        } as Partial<Props["reservation"]>)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Review and allocate" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(mocks.options).toHaveBeenCalled());

    fireEvent.mouseDown(within(dialog).getByRole("combobox", { name: /Inventory/ }));
    fireEvent.click(await screen.findByRole("option", { name: "Rink Storage Room (13 available)" }));
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: /Quantity/ }), { target: { value: "15" } });

    expect(within(dialog).getByText("Only 13 available at this location for these dates.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Approve and allocate" })).toBeDisabled();
    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it("shows a server error inside the open dialog rather than behind it", async () => {
    mocks.approve.mockResolvedValue({ success: false, error: "Not enough matching pooled stock remains for these dates." });
    render(
      <GearReservationLifecycleControls
        leagueId="league-1"
        reservation={reservation({
          status: "REQUESTED",
          capabilities: { canApproveAndAllocate: true, canDecline: false, canReschedule: false, canCancel: false },
        } as Partial<Props["reservation"]>)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Review and allocate" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(mocks.options).toHaveBeenCalled());
    fireEvent.mouseDown(within(dialog).getByRole("combobox", { name: /Inventory/ }));
    fireEvent.click(await screen.findByRole("option", { name: "Rink Storage Room (13 available)" }));
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: /Quantity/ }), { target: { value: "8" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve and allocate" }));

    expect(await within(dialog).findByText("Not enough matching pooled stock remains for these dates.")).toBeInTheDocument();
    expect(screen.getAllByText("Not enough matching pooled stock remains for these dates.")).toHaveLength(1);
  });
});
