import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GearInventoryManager } from "@/components/features/gear/GearInventoryManager";
import type { GearInventoryContext } from "@/lib/actions/gear-context";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { mockCreateGearStorageLocation } = vi.hoisted(() => ({
  mockCreateGearStorageLocation: vi.fn(),
}));
vi.mock("@/lib/actions/gear-inventory", () => ({
  adjustGearPoolStock: vi.fn(),
  archiveGearCatalogItem: vi.fn(),
  archiveGearStorageLocation: vi.fn(),
  changeGearUnitCondition: vi.fn(),
  createGearCatalogItem: vi.fn(),
  createGearStorageLocation: (...args: unknown[]) => mockCreateGearStorageLocation(...args),
  createGearUnit: vi.fn(),
  retireGearUnit: vi.fn(),
  transferGearPoolStock: vi.fn(),
  transferGearUnit: vi.fn(),
  unretireGearUnit: vi.fn(),
  updateGearCatalogItem: vi.fn(),
  updateGearStorageLocation: vi.fn(),
  updateGearUnit: vi.fn(),
}));

const emptyAdminData: GearInventoryContext = {
  league: { id: "cllllllllllllllllllllllll", name: "Metro" },
  canManageInventory: true,
  summary: { pooledOnHand: 0, pooledAvailable: 0, taggedUnits: 0, taggedAvailable: 0 },
  locations: [],
  catalogItems: [],
  pooledStock: [],
  units: [],
  recentActivity: { items: [], page: 1, hasMore: false, search: "" },
};

describe("GearInventoryManager", () => {
  it("renders and focuses a returned dialog error without closing the dialog", async () => {
    mockCreateGearStorageLocation.mockResolvedValue({
      success: false,
      error: "Please correct the highlighted inventory fields.",
      details: [{ path: ["name"], message: "Required" }],
    });
    render(<GearInventoryManager data={emptyAdminData} />);

    fireEvent.click(screen.getByRole("button", { name: "Location" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Location name" }), { target: { value: "Locker" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("name: Required");
    expect(screen.getByRole("dialog", { name: "Add storage location" })).toBeVisible();
    expect(error).toHaveFocus();
  });

  it("shows an explicit accessible empty state and 44px admin controls", () => {
    render(<GearInventoryManager data={emptyAdminData} />);

    expect(screen.getByRole("status")).toHaveTextContent("Start by adding a storage location");
    expect(screen.getByRole("button", { name: "Location" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Catalog item" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Pooled stock" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Tagged unit" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Search inventory" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Pooled stock" }));
    expect(screen.getByRole("dialog", { name: "Adjust pooled stock" })).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: "Initial quantity" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "Location" }));
    expect(screen.getByRole("dialog", { name: "Add storage location" })).toBeVisible();
  });

  it("keeps edit and condition details visible for reserved mobile unit cards", () => {
    render(<GearInventoryManager data={{
      ...emptyAdminData,
      units: [{
        id: "cunittttttttttttttttttttt",
        catalogItemId: "caaaaaaaaaaaaaaaaaaaaaaaa",
        catalogName: "Helmet",
        assetTag: "TAG42",
        status: "RESERVED",
        currentCondition: "GOOD",
        currentLocationId: "clocationxxxxxxxxxxxxxxxx",
        currentLocationName: "Locker",
        version: 1,
      }],
      summary: { ...emptyAdminData.summary, taggedUnits: 1 },
    }} />);

    expect(screen.getByText(/TAG42.*Locker.*Good/)).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Edit" })).not.toHaveLength(0);
  });

  it("uses explicit filtered collection lengths for no-search-result copy", () => {
    render(<GearInventoryManager data={{
      ...emptyAdminData,
      pooledStock: [{
        id: "cstockkkkkkkkkkkkkkkkkkkkk",
        catalogItemId: "caaaaaaaaaaaaaaaaaaaaaaaa",
        catalogName: "Helmet",
        category: "Safety",
        locationId: "clocationxxxxxxxxxxxxxxxx",
        locationName: "Locker",
        condition: "GOOD",
        quantityOnHand: 2,
        committedQuantity: 0,
        availableQuantity: 2,
        version: 1,
      }],
    }} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Search inventory" }), { target: { value: "No match" } });
    expect(screen.getByText("No pooled inventory matches this search.")).toBeVisible();
  });
});
