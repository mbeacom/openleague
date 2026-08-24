import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/actions/association-profile", () => ({
  setAssociationProfilePublished: vi.fn(),
  updateAssociationProfile: vi.fn(),
  updateAssociationSlug: vi.fn(),
  updateTeamPublicProfile: vi.fn(),
}));

import AssociationProfileEditor from "@/components/features/association-profile/AssociationProfileEditor";

describe("AssociationProfileEditor", () => {
  it("exposes association branding and approved team identity controls", () => {
    render(
      <AssociationProfileEditor
        leagueId="league-1"
        profile={{
          name: "Metro Hockey",
          slug: "metro",
          profileStatus: "PUBLISHED",
          publicDescription: "Association description",
          logoUrl: "https://example.com/association.png",
          brandPrimaryColor: "#123456",
          brandSecondaryColor: "#654321",
          publicEmail: null,
          publicPhone: null,
        }}
        teams={[
          {
            id: "team-1",
            name: "Blades",
            slug: "blades",
            profileStatus: "DRAFT",
            publicDescription: "Team description",
            logoUrl: "https://example.com/team.png",
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("Primary brand color")).toHaveValue("#123456");
    expect(screen.getByLabelText("Secondary brand color")).toHaveValue("#654321");
    expect(screen.getByRole("textbox", { name: "Blades public address" })).toHaveValue("blades");
    expect(screen.getByRole("textbox", { name: "Blades public description" })).toHaveValue(
      "Team description",
    );
    expect(screen.getByRole("textbox", { name: "Blades logo URL" })).toHaveValue(
      "https://example.com/team.png",
    );
  });
});
