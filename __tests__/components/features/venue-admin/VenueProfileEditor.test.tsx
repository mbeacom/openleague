import { ThemeProvider } from "@mui/material/styles";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VenueProfileEditor } from "@/components/features/venue-admin/VenueProfileEditor";
import theme from "@/lib/theme";

const { mockUpdateVenueProfile, mockPublishVenueProfile } = vi.hoisted(() => ({
  mockUpdateVenueProfile: vi.fn(),
  mockPublishVenueProfile: vi.fn(),
}));

vi.mock("@/lib/actions/venue-organizations", () => ({
  updateVenueProfile: (...args: unknown[]) => mockUpdateVenueProfile(...args),
  publishVenueProfile: (...args: unknown[]) => mockPublishVenueProfile(...args),
}));

const venue = {
  id: "clvenxxxxxxxxxxxxxxxxxxxxxxx",
  name: "North Rink",
  address: "100 Ice Way",
  slug: "north-rink",
  city: "Cleveland",
  state: "OH",
  zipCode: "44114",
  website: "https://example.com",
  publicDescription: "Community rink",
  logoUrl: "https://example.com/logo.png",
  brandPrimaryColor: "#003B73",
  brandSecondaryColor: "#18A999",
  timezone: "America/New_York",
  publicEmail: "info@example.com",
  publicPhone: "",
  privateManagerNotes: "Private note",
  profileStatus: "DRAFT",
};

function renderEditor() {
  return render(
    <ThemeProvider theme={theme}>
      <VenueProfileEditor organizationId="clorgxxxxxxxxxxxxxxxxxxxxxxx" venue={venue} />
    </ThemeProvider>
  );
}

describe("VenueProfileEditor", () => {
beforeEach(() => {
  vi.clearAllMocks();
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = MockResizeObserver as typeof ResizeObserver;
  mockUpdateVenueProfile.mockResolvedValue({
      success: true,
      data: {
        venueId: venue.id,
        profileStatus: "DRAFT",
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
    });
    mockPublishVenueProfile.mockResolvedValue({
      success: true,
      data: {
        venueId: venue.id,
        profileStatus: "PUBLISHED",
        publishedAt: new Date("2026-01-01T00:00:00Z"),
      },
    });
  });

  it("renders public, branding, and private manager fields", () => {
    renderEditor();

    expect(screen.getByRole("heading", { name: "Venue profile" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Venue name/)).toHaveValue("North Rink");
    expect(screen.getByLabelText("Public slug")).toHaveValue("north-rink");
    expect(screen.getByLabelText("Street address")).toHaveValue("100 Ice Way");
    expect(screen.getByLabelText("Logo URL")).toHaveValue("https://example.com/logo.png");
    expect(screen.getByLabelText("Private manager notes")).toHaveValue("Private note");
  });

  it("saves edited profile values", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.clear(screen.getByLabelText("Public description"));
    await user.type(screen.getByLabelText("Public description"), "Updated rink description");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(mockUpdateVenueProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          venueId: venue.id,
          publicDescription: "Updated rink description",
        })
      );
    });
    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
  });

  it("publishes the profile without submitting the edit form", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Publish profile" }));

    await waitFor(() => {
      expect(mockPublishVenueProfile).toHaveBeenCalledWith({
        organizationId: "clorgxxxxxxxxxxxxxxxxxxxxxxx",
        venueId: venue.id,
      });
    });
    expect(mockUpdateVenueProfile).not.toHaveBeenCalled();
  });
});
