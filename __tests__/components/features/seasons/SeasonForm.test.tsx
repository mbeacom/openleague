import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SeasonForm } from "@/components/features/seasons/SeasonForm";
import { createSeason } from "@/lib/actions/seasons";

// Mock the Server Actions
vi.mock("@/lib/actions/seasons", () => ({
  createSeason: vi.fn(),
  updateSeason: vi.fn(),
}));

const LEAGUE_ID = "clleague0000000000000001";
const SEASON_ID = "clseason0000000000000001";

const singleOwner = [{ name: "Metro Youth League", owner: { leagueId: LEAGUE_ID } }];

const editValues = {
  seasonId: SEASON_ID,
  name: "Fall 2026",
  description: "Our fall season",
  startDate: new Date("2026-09-01T00:00:00.000Z"),
  endDate: new Date("2026-12-01T00:00:00.000Z"),
  format: null,
};

describe("SeasonForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create mode (FR-003 / US1 scenario 1)", () => {
    it("shows name, description, and date range fields", () => {
      render(<SeasonForm ownerOptions={singleOwner} />);

      expect(screen.getByLabelText(/season name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/starts/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/ends/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /create season/i })).toBeInTheDocument();
    });

    it("presents NO format control on the create path", () => {
      render(<SeasonForm ownerOptions={singleOwner} />);

      expect(screen.queryByLabelText(/format/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/format/i)).not.toBeInTheDocument();
    });

    it("uses a single owner option silently (no owner picker)", () => {
      render(<SeasonForm ownerOptions={singleOwner} />);

      expect(screen.queryByLabelText(/season for/i)).not.toBeInTheDocument();
    });

    it("shows an owner picker when multiple owner options exist", () => {
      render(
        <SeasonForm
          ownerOptions={[
            ...singleOwner,
            { name: "Standalone Team", owner: { teamId: "clteama00000000000000001" } },
          ]}
        />
      );

      expect(screen.getByLabelText(/season for/i)).toBeInTheDocument();
    });

    it("submits name, description, dates, and owner — and no format", async () => {
      const user = userEvent.setup();
      vi.mocked(createSeason).mockResolvedValue({
        success: true,
        data: { id: SEASON_ID },
      } as Awaited<ReturnType<typeof createSeason>>);

      render(<SeasonForm ownerOptions={singleOwner} />);

      await user.type(screen.getByLabelText(/season name/i), "Fall 2026");
      fireEvent.change(screen.getByLabelText(/starts/i), { target: { value: "2026-09-01" } });
      fireEvent.change(screen.getByLabelText(/ends/i), { target: { value: "2026-12-01" } });
      await user.click(screen.getByRole("button", { name: /create season/i }));

      await waitFor(() => {
        expect(createSeason).toHaveBeenCalledTimes(1);
      });
      const input = vi.mocked(createSeason).mock.calls[0][0];
      expect(input.name).toBe("Fall 2026");
      expect(input.leagueId).toBe(LEAGUE_ID);
      expect(input.teamId).toBeUndefined();
      expect(input).not.toHaveProperty("format");
    });
  });

  describe("edit mode (FR-004/005)", () => {
    it("shows the optional format select", () => {
      render(<SeasonForm initialValues={editValues} />);

      expect(screen.getByLabelText(/format label \(optional\)/i)).toBeInTheDocument();
    });

    it("defaults the format select to Not specified", async () => {
      const user = userEvent.setup();
      render(<SeasonForm initialValues={editValues} />);

      // With format: null the empty-value option is the selected one.
      await user.click(screen.getByLabelText(/format label \(optional\)/i));
      const listbox = await screen.findByRole("listbox");
      expect(
        within(listbox).getByRole("option", { name: "Not specified" })
      ).toHaveAttribute("aria-selected", "true");
    });

    it("offers a Not specified option alongside the format labels", async () => {
      const user = userEvent.setup();
      render(<SeasonForm initialValues={editValues} />);

      await user.click(screen.getByLabelText(/format label \(optional\)/i));

      const listbox = await screen.findByRole("listbox");
      expect(within(listbox).getByRole("option", { name: "Not specified" })).toBeInTheDocument();
      expect(within(listbox).getByRole("option", { name: "Round robin" })).toBeInTheDocument();
      expect(within(listbox).getByRole("option", { name: "Custom" })).toBeInTheDocument();
    });

    it("prefills the season fields from initial values", () => {
      render(<SeasonForm initialValues={editValues} />);

      expect(screen.getByLabelText(/season name/i)).toHaveValue("Fall 2026");
      expect(screen.getByLabelText(/description/i)).toHaveValue("Our fall season");
      expect(screen.getByLabelText(/starts/i)).toHaveValue("2026-09-01");
      expect(screen.getByLabelText(/ends/i)).toHaveValue("2026-12-01");
      expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
    });
  });
});
