import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import PublicAssociationProfile from "@/components/features/association-profile/PublicAssociationProfile";

/**
 * SC-007: every published team, the public schedule, public signup events,
 * public announcements, and an active public wishlist must be reachable from
 * the association landing page in no more than three link or button
 * activations.
 *
 * Everything below is reachable in ONE, which leaves two to spare. Counting
 * links on the landing page is the whole test: if a surface has no link here,
 * no number of further activations reaches it.
 */

const association = {
  id: "league-1",
  name: "Metro Hockey",
  slug: "metro-hockey",
  sport: "HOCKEY",
  publicDescription: "Youth hockey.",
  logoUrl: null,
  brandPrimaryColor: "#123456",
  brandSecondaryColor: "#654321",
  publicEmail: "hello@metro.example.com",
  publicPhone: null,
  divisions: [{ id: "d1", name: "U12 Recreational", ageGroup: "U12" }],
  teams: [
    { id: "t1", name: "Metro Blades", slug: "metro-blades", season: "Winter", division: { name: "U12 Recreational", ageGroup: "U12" } },
    { id: "t2", name: "Harbor Hawks", slug: "harbor-hawks", season: "Winter", division: null },
  ],
  publicContentItems: [
    { id: "c1", slug: "season-opens", title: "Season opens", summary: "Monday.", publishAt: new Date("2026-05-01"), team: null },
  ],
  gearWishlist: { shareToken: "tok-abc", title: "Equipment wishlist" },
};

function hrefs() {
  return screen.getAllByRole("link").map((a) => a.getAttribute("href"));
}

describe("association landing page reachability (SC-007)", () => {
  it("reaches every published team in one activation", () => {
    render(<PublicAssociationProfile association={association} />);

    expect(hrefs()).toEqual(
      expect.arrayContaining([
        "/associations/metro-hockey/teams/metro-blades",
        "/associations/metro-hockey/teams/harbor-hawks",
      ]),
    );
  });

  it("reaches the public schedule in one activation", () => {
    render(<PublicAssociationProfile association={association} />);
    expect(hrefs()).toContain("/associations/metro-hockey/schedule");
  });

  it("reaches signup events in one activation", () => {
    render(<PublicAssociationProfile association={association} />);
    expect(hrefs()).toContain("/associations/metro-hockey/events");
  });

  it("reaches every public announcement in one activation", () => {
    render(<PublicAssociationProfile association={association} />);
    expect(hrefs()).toContain("/associations/metro-hockey/news/season-opens");
    expect(hrefs()).toContain("/associations/metro-hockey/news");
  });

  it("reaches an active published wishlist in one activation", () => {
    render(<PublicAssociationProfile association={association} />);
    expect(hrefs()).toContain("/gear-wishlist/tok-abc");
  });

  it("omits the wishlist link entirely when none is published", () => {
    // The selector returns null unless status is PUBLISHED, so an unpublished
    // wishlist leaves no token on the page at all.
    render(<PublicAssociationProfile association={{ ...association, gearWishlist: null }} />);
    expect(hrefs().some((href) => href?.startsWith("/gear-wishlist/"))).toBe(false);
  });

  it("shows the public contact details and the description", () => {
    render(<PublicAssociationProfile association={association} />);
    expect(screen.getByText("hello@metro.example.com")).toBeInTheDocument();
    expect(screen.getByText("Youth hockey.")).toBeInTheDocument();
  });

  it("renders a team directory link for the full list", () => {
    render(<PublicAssociationProfile association={association} />);
    expect(hrefs()).toContain("/associations/metro-hockey/teams");
  });
});
