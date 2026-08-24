import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockResolvePublicAssociation, mockListPublicAssociationContentPage } = vi.hoisted(
  () => ({
    mockResolvePublicAssociation: vi.fn(),
    mockListPublicAssociationContentPage: vi.fn(),
  }),
);

vi.mock("@/lib/actions/association-profile", () => ({
  resolvePublicAssociation: mockResolvePublicAssociation,
}));
vi.mock("@/lib/actions/public-content", () => ({
  listPublicAssociationContentPage: mockListPublicAssociationContentPage,
}));

import PublicAssociationNewsPage from "@/app/(marketing)/associations/[slug]/news/page";

describe("PublicAssociationNewsPage", () => {
  it("lists public announcements with bounded direct page navigation", async () => {
    mockResolvePublicAssociation.mockResolvedValue({
      id: "league-1",
      canonicalSlug: "metro",
      redirected: false,
    });
    mockListPublicAssociationContentPage.mockResolvedValue({
      items: [
        {
          id: "item-1",
          slug: "season-opens",
          title: "Season opens",
          summary: "Registration starts Monday.",
        },
      ],
      page: 1,
      totalItems: 21,
      totalPages: 2,
    });

    const page = await PublicAssociationNewsPage({
      params: Promise.resolve({ slug: "metro" }),
      searchParams: Promise.resolve({ page: "1" }),
    });
    render(page);

    expect(screen.getByRole("link", { name: /Season opens/ })).toHaveAttribute(
      "href",
      "/associations/metro/news/season-opens",
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/associations/metro/news?page=2",
    );
    expect(screen.getByLabelText("Page")).toHaveAttribute("max", "2");
  });
});
