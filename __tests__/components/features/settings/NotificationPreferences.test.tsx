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
  emailEnabled: true,
  urgentOnly: false,
  batchDelivery: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdatePreferences.mockResolvedValue({ success: true, data: { updated: true } });
  mockGetAllPreferences.mockResolvedValue({
    success: true,
    data: {
      global: { ...basePreferences },
      leagues: [
        {
          leagueId: "league-1",
          leagueName: "Metro League",
          preferences: { ...basePreferences },
        },
      ],
    },
  });
  mockGetPreferences.mockResolvedValue({ success: true, data: { ...basePreferences } });
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
});
