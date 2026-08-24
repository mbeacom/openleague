import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const {
  mockGetPublicTeamProfile,
  mockResolvePublicAssociation,
  mockGetPublicTeamScheduleItems,
} = vi.hoisted(() => ({
  mockGetPublicTeamProfile: vi.fn(),
  mockResolvePublicAssociation: vi.fn(),
  mockGetPublicTeamScheduleItems: vi.fn(),
}));

vi.mock("@/lib/actions/association-profile", () => ({
  getPublicTeamProfile: mockGetPublicTeamProfile,
  resolvePublicAssociation: mockResolvePublicAssociation,
}));
vi.mock("@/lib/data/schedule-items", () => ({
  getPublicTeamScheduleItems: mockGetPublicTeamScheduleItems,
}));

import PublicTeamPage from "@/app/(marketing)/associations/[slug]/teams/[teamSlug]/page";

describe("PublicTeamPage", () => {
  it("renders approved identity and only the team's public schedule", async () => {
    mockResolvePublicAssociation.mockResolvedValue({
      id: "league-1",
      canonicalSlug: "metro",
      redirected: false,
    });
    mockGetPublicTeamProfile.mockResolvedValue({
      id: "team-1",
      name: "Blades",
      canonicalSlug: "blades",
      season: "Winter",
      logoUrl: "https://example.com/blades.png",
      publicDescription: "Metro's U12 team.",
      division: { name: "U12" },
      league: { name: "Metro Hockey" },
      publicContentItems: [],
    });
    mockGetPublicTeamScheduleItems.mockResolvedValue([
      {
        canonicalScheduleId: "season-game:1",
        title: "Blades vs Hawks",
        startsAt: new Date("2026-09-01T18:00:00Z"),
        venueName: "North Rink",
      },
    ]);

    const page = await PublicTeamPage({
      params: Promise.resolve({ slug: "metro", teamSlug: "blades" }),
    });
    const { container } = render(page);

    expect(screen.getByRole("heading", { level: 1, name: "Blades" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Team schedule" })).toBeInTheDocument();
    expect(screen.getByText("Blades vs Hawks")).toBeInTheDocument();
    expect(container.querySelector('img[src="https://example.com/blades.png"]')).not.toBeNull();
    expect(mockGetPublicTeamScheduleItems).toHaveBeenCalledWith(
      "league-1",
      "team-1",
      expect.objectContaining({
        from: expect.any(Date),
        to: expect.any(Date),
      }),
    );
  });
});
