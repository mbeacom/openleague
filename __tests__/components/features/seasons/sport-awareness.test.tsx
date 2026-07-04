import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameForm } from "@/components/features/seasons/GameForm";

// Mock the Server Actions so rendering is pure
vi.mock("@/lib/actions/season-games", () => ({
  createSeasonGame: vi.fn(),
  updateSeasonGame: vi.fn(),
}));

// SC-007: non-hockey contexts must never leak hockey vocabulary
const HOCKEY_VOCABULARY = /ice|rink|squirt|peewee|bantam|mite/i;

const SEASON_ID = "clseason0000000000000001";
const VENUE_ID = "clvenue00000000000000001";

// Fixture names deliberately avoid hockey vocabulary so the SC-007 sweep
// only measures what the component itself renders.
const baseProps = {
  open: true,
  onClose: vi.fn(),
  seasonId: SEASON_ID,
  teams: [
    { id: "clteama00000000000000001", name: "Northside Hawks" },
    { id: "clteamb00000000000000001", name: "Southside Owls" },
  ],
  venues: [{ id: VENUE_ID, name: "Central Sports Complex", timezone: "America/New_York" }],
  surfacesByVenue: {
    [VENUE_ID]: [{ id: "clsurface000000000000001", name: "Main Surface" }],
  },
};

describe("GameForm sport awareness (SC-007)", () => {
  describe("hockey", () => {
    it("shows the rink usage select", () => {
      render(<GameForm {...baseProps} sport="HOCKEY" />);

      expect(screen.getByLabelText(/rink usage \(optional\)/i)).toBeInTheDocument();
    });

    it("offers Full ice, Half ice, and Cross ice usage options", async () => {
      const user = userEvent.setup();
      render(<GameForm {...baseProps} sport="HOCKEY" />);

      await user.click(screen.getByLabelText(/rink usage \(optional\)/i));

      const listbox = await screen.findByRole("listbox");
      expect(within(listbox).getByRole("option", { name: "Not specified" })).toBeInTheDocument();
      expect(within(listbox).getByRole("option", { name: "Full ice" })).toBeInTheDocument();
      expect(within(listbox).getByRole("option", { name: "Half ice" })).toBeInTheDocument();
      expect(within(listbox).getByRole("option", { name: "Cross ice" })).toBeInTheDocument();
    });
  });

  describe("non-hockey (soccer)", () => {
    it("renders no surface-usage field", () => {
      render(<GameForm {...baseProps} sport="SOCCER" />);

      // The dialog itself must render...
      expect(screen.getByText("Schedule a game")).toBeInTheDocument();
      // ...but without any usage select (surfaceUsageOptions is undefined).
      expect(screen.queryByLabelText(/usage/i)).not.toBeInTheDocument();
    });

    it("contains no hockey vocabulary anywhere in the rendered output", () => {
      render(<GameForm {...baseProps} sport="SOCCER" />);

      // The MUI Dialog renders into a portal, so sweep the whole document.
      expect(document.body.textContent ?? "").not.toMatch(HOCKEY_VOCABULARY);
    });
  });
});
