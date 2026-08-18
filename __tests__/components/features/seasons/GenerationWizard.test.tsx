import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GenerationWizard } from "@/components/features/seasons/GenerationWizard";
import { previewRoundRobin } from "@/lib/actions/season-generation";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/actions/season-generation", () => ({
  previewRoundRobin: vi.fn(),
  generateRoundRobin: vi.fn(),
}));

vi.mock("@/lib/actions/seasons", () => ({
  updateSeason: vi.fn(),
  updateSeasonPhase: vi.fn(),
}));

describe("GenerationWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preselects projected division teams and gives reservation-specific guidance", async () => {
    const user = userEvent.setup();
    vi.mocked(previewRoundRobin).mockResolvedValue({
      success: true,
      data: {
        games: [],
        totalPairings: 1,
        unslottedCount: 1,
        unslottedPairings: [{
          homeTeamId: "clteam00000000000000001",
          awayTeamId: "clteam00000000000000002",
          round: 1,
          reason: "NO_RESERVATION",
        }],
      },
    });

    render(
      <GenerationWizard
        seasonId="clseason000000000000001"
        seasonStartDate={new Date("2099-09-01T00:00:00.000Z")}
        seasonEndDate={new Date("2099-09-30T00:00:00.000Z")}
        phases={[]}
        teams={[
          { id: "clteam00000000000000001", name: "Arrows", divisionId: "cldivision00000000000001" },
          { id: "clteam00000000000000002", name: "Blizzards", divisionId: "cldivision00000000000001" },
          { id: "clteam00000000000000003", name: "Comets", divisionId: null },
        ]}
        divisions={[{ id: "cldivision00000000000001", name: "A Division" }]}
        venues={[{
          id: "clvenue00000000000000001",
          name: "North Rink",
          timezone: "America/New_York",
        }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Generate games" }));
    await user.click(screen.getByLabelText("Format"));
    await user.click(within(await screen.findByRole("listbox")).getByRole("option", {
      name: "Round robin",
    }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    await user.click(screen.getByLabelText("Division (optional)"));
    await user.click(within(await screen.findByRole("listbox")).getByRole("option", {
      name: "A Division",
    }));
    expect(screen.getByRole("checkbox", { name: "Arrows" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Blizzards" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Comets" })).not.toBeChecked();

    await user.click(screen.getByLabelText("Default venue (optional)"));
    await user.click(within(await screen.findByRole("listbox")).getByRole("option", {
      name: "North Rink",
    }));
    await user.click(screen.getByRole("button", { name: "Preview games" }));

    expect(await screen.findByText(/no confirmed reservation inventory was available/i))
      .toBeInTheDocument();
    expect(screen.queryByText(/did not fit in the selected date range/i)).not.toBeInTheDocument();
  });
});
