import { ThemeProvider } from "@mui/material/styles";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VenueRelationshipInvitation } from "@/components/features/venue-admin/VenueRelationshipInvitation";
import { VenueRelationshipManager } from "@/components/features/venue-admin/VenueRelationshipManager";
import theme from "@/lib/theme";

function renderWithTheme(component: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
}

describe("venue relationship components", () => {
  it("renders relationship manager rows", () => {
    renderWithTheme(
      <VenueRelationshipManager
        relationships={[{ id: "rel-1", relationshipType: "HOME", targetType: "TEAM", targetName: "Sharks", status: "ACTIVE" }]}
      />
    );

    expect(screen.getByText("Venue relationships")).toBeInTheDocument();
    expect(screen.getByText("Sharks")).toBeInTheDocument();
  });

  it("renders invitation response controls", () => {
    renderWithTheme(<VenueRelationshipInvitation relationshipId="rel-1" venueName="North Rink" relationshipType="PREFERRED" />);

    expect(screen.getByText("North Rink invited you to become a PREFERRED rink.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });
});
