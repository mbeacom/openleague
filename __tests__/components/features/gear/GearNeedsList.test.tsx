import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GearNeedsList } from "@/components/features/gear/GearNeedsList";

describe("GearNeedsList", () => {
  it("distinguishes need progress from an inventory reservation", () => {
    render(
      <GearNeedsList
        leagueId="league-1"
        needs={[{
          id: "need-1",
          title: "Goalie starter set",
          teamName: "U12 Comets",
          status: "SUBMITTED",
          submittedAt: "2026-08-16T00:00:00.000Z",
          createdAt: "2026-08-16T00:00:00.000Z",
          requestedQuantity: 4,
          fulfilledQuantity: 1,
          priority: "HIGH",
        }]}
      />,
    );

    expect(screen.getAllByText("Goalie starter set")).toHaveLength(2);
    expect(screen.getByText("1 of 4 fulfilled")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View need" })).toHaveAttribute(
      "href",
      "/league/league-1/gear/needs/need-1",
    );
  });
});
