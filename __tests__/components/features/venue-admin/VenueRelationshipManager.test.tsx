import { ThemeProvider } from "@mui/material/styles";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VenueRelationshipInvitation } from "@/components/features/venue-admin/VenueRelationshipInvitation";
import { VenueRelationshipManager } from "@/components/features/venue-admin/VenueRelationshipManager";
import theme from "@/lib/theme";

const { mockRespondToVenueRelationship } = vi.hoisted(() => ({
  mockRespondToVenueRelationship: vi.fn(),
}));

vi.mock("@/lib/actions/venue-relationships", () => ({
  respondToVenueRelationship: (...args: unknown[]) => mockRespondToVenueRelationship(...args),
}));

function renderWithTheme(component: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
}

describe("venue relationship components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRespondToVenueRelationship.mockResolvedValue({
      success: true,
      data: { relationshipId: "rel-1", status: "ACTIVE" },
    });
  });

  it("renders relationship manager rows", () => {
    renderWithTheme(
      <VenueRelationshipManager
        relationships={[{ id: "rel-1", relationshipType: "HOME", targetType: "TEAM", targetName: "Sharks", status: "ACTIVE" }]}
      />
    );

    expect(screen.getByText("Venue relationships")).toBeInTheDocument();
    expect(screen.getByText("Sharks")).toBeInTheDocument();
  });

  it("accepts invitation responses through the Server Action", async () => {
    const user = userEvent.setup();
    renderWithTheme(<VenueRelationshipInvitation relationshipId="rel-1" venueName="North Rink" relationshipType="PREFERRED" />);

    expect(screen.getByText("North Rink invited you to become a PREFERRED rink.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(mockRespondToVenueRelationship).toHaveBeenCalledWith({ relationshipId: "rel-1", response: "ACCEPT" });
    });
    expect(await screen.findByText("Venue relationship accepted.")).toBeInTheDocument();
  });
});
