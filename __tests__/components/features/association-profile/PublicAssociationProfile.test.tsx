import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import PublicAssociationProfile from "@/components/features/association-profile/PublicAssociationProfile";

const base = {
  id: "league-1",
  name: "Metro Hockey",
  slug: "metro-hockey",
  sport: "HOCKEY",
  publicDescription: null,
  logoUrl: null,
  brandPrimaryColor: null,
  brandSecondaryColor: null,
  publicEmail: null,
  publicPhone: null,
  divisions: [],
  teams: [],
  publicContentItems: [],
  gearWishlist: null,
};

describe("PublicAssociationProfile", () => {
  it("renders the association name as the page heading", () => {
    render(<PublicAssociationProfile association={base} />);
    expect(screen.getByRole("heading", { level: 1, name: "Metro Hockey" })).toBeInTheDocument();
  });

  it("omits empty sections rather than showing bare headings", () => {
    render(<PublicAssociationProfile association={base} />);

    expect(screen.queryByRole("heading", { name: "Teams" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "News" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Divisions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Contact" })).not.toBeInTheDocument();
  });

  it("shows the contact section only when a public detail exists", () => {
    render(
      <PublicAssociationProfile
        association={{ ...base, publicEmail: "hello@example.com" }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Contact" })).toBeInTheDocument();
    expect(screen.getByText("hello@example.com")).toBeInTheDocument();
  });

  it("labels the wishlist with its own title", () => {
    render(
      <PublicAssociationProfile
        association={{ ...base, gearWishlist: { shareToken: "tok", title: "Skate drive" } }}
      />,
    );
    expect(screen.getByRole("link", { name: "Skate drive" })).toBeInTheDocument();
  });

  it("names a team's division and season", () => {
    render(
      <PublicAssociationProfile
        association={{
          ...base,
          teams: [{ id: "t1", name: "Blades", slug: "blades", season: "Winter", division: { name: "U12", ageGroup: "U12" } }],
        }}
      />,
    );
    expect(screen.getByText("U12 · Winter")).toBeInTheDocument();
  });
});
