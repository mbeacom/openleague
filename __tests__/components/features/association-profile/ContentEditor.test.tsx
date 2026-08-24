import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { mockCreatePublicContent } = vi.hoisted(() => ({
  mockCreatePublicContent: vi.fn(),
}));

vi.mock("@/lib/actions/public-content", () => ({
  archivePublicContent: vi.fn(),
  createPublicContent: mockCreatePublicContent,
  updatePublicContent: vi.fn(),
}));

import ContentEditor from "@/components/features/association-profile/ContentEditor";

describe("ContentEditor", () => {
  it("lets a team-scoped publisher save a draft for an authorized team", async () => {
    mockCreatePublicContent.mockResolvedValue({ success: true, data: { id: "item-1" } });

    render(
      <ContentEditor
        leagueId="league-1"
        canPublishAssociationWide={false}
        teams={[{ id: "team-1", name: "Blades" }]}
        items={[]}
      />,
    );

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Season opens" } });
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "season-opens" } });
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "Bring skates." } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(mockCreatePublicContent).toHaveBeenCalledWith(
        expect.objectContaining({
          leagueId: "league-1",
          teamId: "team-1",
          status: "DRAFT",
        }),
      );
    });
    expect(screen.queryByText("Whole association")).not.toBeInTheDocument();
  });
});
