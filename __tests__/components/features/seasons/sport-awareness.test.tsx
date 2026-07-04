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
const SURFACE_ID = "clsurface000000000000001";

// Fixture names deliberately avoid hockey vocabulary so the SC-007 sweep
// only measures what the component itself renders. Hockey vocabulary now
// enters exclusively through segment/whole-surface data authored for ICE
// surfaces (research R7) — never through the component.
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
    [VENUE_ID]: [{ id: SURFACE_ID, name: "Main Surface" }],
  },
};

// ICE preset segment names (segment-presets, data-model 006) as a venue
// admin would have applied them to an ICE surface.
const icePresetSegments = {
  [SURFACE_ID]: [
    { id: "clseghalfa00000000000001", name: "North half" },
    { id: "clseghalfb00000000000001", name: "South half" },
    { id: "clsegcross10000000000001", name: "Cross-ice 1" },
  ],
};

// Neutral segments for a non-ice surface — no hockey vocabulary anywhere.
const neutralSegments = {
  [SURFACE_ID]: [
    { id: "clsegeast000000000000001", name: "East half" },
    { id: "clsegwest000000000000001", name: "West half" },
  ],
};

async function pickVenueAndSurface(surfaceLabelPattern: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText(/venue \(optional\)/i));
  await user.click(await screen.findByRole("option", { name: "Central Sports Complex" }));
  await user.click(screen.getByLabelText(surfaceLabelPattern));
  await user.click(await screen.findByRole("option", { name: "Main Surface" }));
  return user;
}

describe("GameForm sport awareness (SC-007)", () => {
  describe("hockey with an ICE surface carrying preset segments", () => {
    it("shows the segment select once a segmented surface is chosen", async () => {
      render(
        <GameForm
          {...baseProps}
          sport="HOCKEY"
          segmentsBySurface={icePresetSegments}
          wholeLabelBySurface={{ [SURFACE_ID]: "Full ice" }}
        />
      );

      // No segment select until a surface with segments is picked.
      expect(screen.queryByLabelText(/segment \(optional\)/i)).not.toBeInTheDocument();

      await pickVenueAndSurface(/rink \(optional\)/i);

      expect(screen.getByLabelText(/segment \(optional\)/i)).toBeInTheDocument();
    });

    it("offers the ice preset segment names plus the whole-surface label", async () => {
      render(
        <GameForm
          {...baseProps}
          sport="HOCKEY"
          segmentsBySurface={icePresetSegments}
          wholeLabelBySurface={{ [SURFACE_ID]: "Full ice" }}
        />
      );

      const user = await pickVenueAndSurface(/rink \(optional\)/i);
      await user.click(screen.getByLabelText(/segment \(optional\)/i));

      const listbox = await screen.findByRole("listbox");
      expect(within(listbox).getByRole("option", { name: "Full ice" })).toBeInTheDocument();
      expect(within(listbox).getByRole("option", { name: "North half" })).toBeInTheDocument();
      expect(within(listbox).getByRole("option", { name: "South half" })).toBeInTheDocument();
      expect(within(listbox).getByRole("option", { name: "Cross-ice 1" })).toBeInTheDocument();
    });
  });

  describe("non-hockey (soccer) with neutral fixtures", () => {
    it("renders no segment select when the chosen surface has no segments", async () => {
      render(<GameForm {...baseProps} sport="SOCCER" />);

      // The dialog itself must render...
      expect(screen.getByText("Schedule a game")).toBeInTheDocument();

      await pickVenueAndSurface(/surface \(optional\)/i);

      // ...but without a segment select (segmentsBySurface is empty).
      expect(screen.queryByLabelText(/segment \(optional\)/i)).not.toBeInTheDocument();
    });

    it("contains no hockey vocabulary anywhere in the rendered output", () => {
      render(<GameForm {...baseProps} sport="SOCCER" segmentsBySurface={neutralSegments} />);

      // The MUI Dialog renders into a portal, so sweep the whole document.
      expect(document.body.textContent ?? "").not.toMatch(HOCKEY_VOCABULARY);
    });

    it("keeps the segment picker vocabulary neutral for segmented non-ice surfaces", async () => {
      render(<GameForm {...baseProps} sport="SOCCER" segmentsBySurface={neutralSegments} />);

      const user = await pickVenueAndSurface(/surface \(optional\)/i);
      await user.click(screen.getByLabelText(/segment \(optional\)/i));

      const listbox = await screen.findByRole("listbox");
      // Without a custom whole label the option falls back to "Whole surface".
      expect(within(listbox).getByRole("option", { name: "Whole surface" })).toBeInTheDocument();
      expect(within(listbox).getByRole("option", { name: "East half" })).toBeInTheDocument();

      // SC-007 sweep with the picker open: still no hockey vocabulary.
      expect(document.body.textContent ?? "").not.toMatch(HOCKEY_VOCABULARY);
    });
  });
});
