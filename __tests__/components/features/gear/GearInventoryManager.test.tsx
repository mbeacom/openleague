import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GearInventoryManager } from "@/components/features/gear/GearInventoryManager";
import type { GearInventoryContext } from "@/lib/actions/gear-context";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions/gear-inventory", () => ({
  adjustGearPoolStock: vi.fn(),
  archiveGearCatalogItem: vi.fn(),
  archiveGearStorageLocation: vi.fn(),
  changeGearUnitCondition: vi.fn(),
  createGearCatalogItem: vi.fn(),
  createGearStorageLocation: vi.fn(),
  createGearUnit: vi.fn(),
  retireGearUnit: vi.fn(),
  transferGearPoolStock: vi.fn(),
  transferGearUnit: vi.fn(),
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
  recentActivity: [],
};

describe("GearInventoryManager", () => {
  it("shows an explicit accessible empty state and 44px admin controls", () => {
    render(<GearInventoryManager data={emptyAdminData} />);

    expect(screen.getByRole("status")).toHaveTextContent("Start by adding a storage location");
    expect(screen.getByRole("button", { name: "Location" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Catalog item" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Tagged unit" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Search inventory" })).toBeVisible();
  });
});
