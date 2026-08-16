/**
 * Tests for NotificationPreferencesComponent (Track 2).
 *
 * Covers the league-scope fix: league-accordion toggles must save with their
 * own leagueId and must not mutate global preference state, while global-card
 * toggles save the global (no leagueId) row.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationPreferencesComponent } from "@/components/features/settings/NotificationPreferences";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  getAllNotificationPreferences,
} from "@/lib/actions/notifications";

vi.mock("@/lib/actions/notifications", () => ({
  getNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
  getAllNotificationPreferences: vi.fn(),
}));

const mockGetPreferences = getNotificationPreferences as ReturnType<typeof vi.fn>;
const mockUpdatePreferences = updateNotificationPreferences as ReturnType<typeof vi.fn>;
const mockGetAllPreferences = getAllNotificationPreferences as ReturnType<typeof vi.fn>;

const basePreferences = {
  leagueMessages: true,
  leagueAnnouncements: true,
  eventNotifications: true,
  rsvpReminders: true,
  teamInvitations: true,
  practicePlanNotifications: true,
  gearNotifications: true,
  emailEnabled: true,
  urgentOnly: false,
  batchDelivery: false,
};
const globalPreferences = {
  ...basePreferences,
  source: "GLOBAL" as const,
  hasLeagueOverride: false,
};
const leaguePreferences = {
  ...basePreferences,
  source: "GLOBAL" as const,
  hasLeagueOverride: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdatePreferences.mockImplementation(async (input) => ({
    success: true,
    data: {
      updated: true,
      preferences: {
        ...globalPreferences,
        ...input.preferences,
        ...(input.leagueId ? { source: "LEAGUE", hasLeagueOverride: true } : {}),
      },
    },
  }));
  mockGetAllPreferences.mockResolvedValue({
    success: true,
    data: {
      global: globalPreferences,
      leagues: [
        {
          leagueId: "league-1",
          leagueName: "Metro League",
          preferences: leaguePreferences,
        },
      ],
    },
  });
  mockGetPreferences.mockResolvedValue({ success: true, data: globalPreferences });
});

describe("NotificationPreferencesComponent", () => {
  it("saves global toggles without a leagueId", async () => {
    const user = userEvent.setup();
    render(<NotificationPreferencesComponent />);

    const [globalSwitch] = await screen.findAllByLabelText("Event Notifications");
    await user.click(globalSwitch);

    await waitFor(() =>
      expect(mockUpdatePreferences).toHaveBeenCalledWith({
        leagueId: undefined,
        preferences: { eventNotifications: false },
      })
    );
  });

  it("saves league-accordion toggles with that league's id and leaves global state alone", async () => {
    const user = userEvent.setup();
    render(<NotificationPreferencesComponent />);

    const switches = await screen.findAllByLabelText("Event Notifications");
    expect(switches).toHaveLength(2);
    const [globalSwitch, leagueSwitch] = switches;

    await user.click(leagueSwitch);

    await waitFor(() =>
      expect(mockUpdatePreferences).toHaveBeenCalledWith({
        leagueId: "league-1",
        preferences: { eventNotifications: false },
      })
    );
    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);
    // The league toggle flipped; the global one did not.
    await waitFor(() => expect(leagueSwitch).not.toBeChecked());
    expect(globalSwitch).toBeChecked();
  });

  it("reverts only the league entry when a league-scoped save fails", async () => {
    mockUpdatePreferences.mockResolvedValue({ success: false, error: "Save failed" });
    const user = userEvent.setup();
    render(<NotificationPreferencesComponent />);

    const switches = await screen.findAllByLabelText("RSVP Reminders");
    const [globalSwitch, leagueSwitch] = switches;

    await user.click(leagueSwitch);

    await waitFor(() => expect(screen.getByText("Save failed")).toBeInTheDocument());
    await waitFor(() => expect(leagueSwitch).toBeChecked());
    expect(globalSwitch).toBeChecked();
  });

  it("renders the practice plan notifications toggle and saves it", async () => {
    const user = userEvent.setup();
    render(<NotificationPreferencesComponent />);

    const [globalSwitch] = await screen.findAllByLabelText("Practice Plan Notifications");
    await user.click(globalSwitch);

    await waitFor(() =>
      expect(mockUpdatePreferences).toHaveBeenCalledWith({
        leagueId: undefined,
        preferences: { practicePlanNotifications: false },
      })
    );
  });

  it("uses the component-level leagueId in single-league mode", async () => {
    const user = userEvent.setup();
    render(<NotificationPreferencesComponent leagueId="league-9" leagueName="North League" />);

    await waitFor(() => expect(mockGetPreferences).toHaveBeenCalledWith("league-9"));
    const [onlySwitch] = await screen.findAllByLabelText("Team Invitations");
    await user.click(onlySwitch);

    await waitFor(() =>
      expect(mockUpdatePreferences).toHaveBeenCalledWith({
        leagueId: "league-9",
        preferences: { teamInvitations: false },
      })
    );
  });

  it("refreshes every globally inherited league entry after a global preference update", async () => {
    const user = userEvent.setup();
    const updated = { ...globalPreferences, eventNotifications: false };
    mockUpdatePreferences.mockResolvedValue({ success: true, data: { updated: true, preferences: updated } });
    render(<NotificationPreferencesComponent />);

    const [globalSwitch, leagueSwitch] = await screen.findAllByLabelText("Event Notifications");
    await user.click(globalSwitch);

    await waitFor(() => {
      expect(globalSwitch).not.toBeChecked();
      expect(leagueSwitch).not.toBeChecked();
    });
  });

  it("replaces an inherited league entry with the returned league override", async () => {
    const user = userEvent.setup();
    const override = {
      ...leaguePreferences,
      gearNotifications: false,
      source: "LEAGUE" as const,
      hasLeagueOverride: true,
    };
    mockUpdatePreferences.mockResolvedValue({ success: true, data: { updated: true, preferences: override } });
    render(<NotificationPreferencesComponent />);

    const switches = await screen.findAllByLabelText("Gear Requests and Custody");
    await user.click(switches[1]);

    await waitFor(() => {
      expect(switches[1]).not.toBeChecked();
      expect(screen.queryByText("Using global preference")).not.toBeInTheDocument();
    });
  });
});
