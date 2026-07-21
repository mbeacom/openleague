/**
 * Notification-preference gating in email templates (Track 2).
 *
 * Covers the prefs filters on sendEventNotifications and sendRSVPReminders,
 * and the teamInvitations gate on the courtesy notifications to EXISTING
 * users (sendExistingUserNotification / sendLeagueMemberAddedNotification).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSendEmail, mockPrisma } = vi.hoisted(() => ({
  mockSendEmail: vi.fn(),
  mockPrisma: {
    event: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    notificationPreference: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/email/client", () => ({
  sendEmail: mockSendEmail,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/utils/date", () => ({
  FALLBACK_TIME_ZONE: "America/New_York",
  formatDateTime: vi.fn(() => "Jan 1, 2026, 10:00 AM"),
}));

vi.mock("@/lib/env", () => ({
  getBaseUrl: () => "http://localhost:3000",
}));

vi.mock("@/lib/services/notification", () => ({
  notificationService: {},
}));

import {
  sendEventNotifications,
  sendRSVPReminders,
  sendExistingUserNotification,
  sendLeagueMemberAddedNotification,
} from "@/lib/email/templates";

function buildEvent(members: Array<{ email: string; prefs: Array<{ eventNotifications: boolean; emailEnabled: boolean }> }>) {
  return {
    id: "evt1",
    type: "GAME",
    title: "Game vs Rivals",
    startAt: new Date("2026-01-01T15:00:00Z"),
    location: "Rink A",
    opponent: "Rivals",
    venue: null,
    team: {
      name: "Sharks",
      members: members.map(({ email, prefs }) => ({
        user: { email, notificationPreferences: prefs },
      })),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendEmail.mockResolvedValue(undefined);
  mockPrisma.notificationPreference.findMany.mockResolvedValue([]);
});

describe("sendEventNotifications preference filtering", () => {
  it("sends to members with no preference rows (default) and fully-enabled members", async () => {
    mockPrisma.event.findUnique.mockResolvedValue(
      buildEvent([
        { email: "default@example.com", prefs: [] },
        { email: "enabled@example.com", prefs: [{ eventNotifications: true, emailEnabled: true }] },
      ])
    );

    await sendEventNotifications("evt1", "created");

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const message = mockSendEmail.mock.calls[0][0];
    expect(message.to).toEqual([
      { email: "default@example.com" },
      { email: "enabled@example.com" },
    ]);
  });

  it("filters out members who disabled event notifications or email entirely", async () => {
    mockPrisma.event.findUnique.mockResolvedValue(
      buildEvent([
        { email: "keep@example.com", prefs: [] },
        { email: "no-events@example.com", prefs: [{ eventNotifications: false, emailEnabled: true }] },
        { email: "no-email@example.com", prefs: [{ eventNotifications: true, emailEnabled: false }] },
      ])
    );

    await sendEventNotifications("evt1", "updated");

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const message = mockSendEmail.mock.calls[0][0];
    expect(message.to).toEqual([{ email: "keep@example.com" }]);
  });

  it("treats any opted-out preference row (global or league) as an opt-out", async () => {
    mockPrisma.event.findUnique.mockResolvedValue(
      buildEvent([
        {
          email: "mixed@example.com",
          prefs: [
            { eventNotifications: true, emailEnabled: true },
            { eventNotifications: false, emailEnabled: true },
          ],
        },
      ])
    );

    await sendEventNotifications("evt1", "created");

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("skips sending entirely when every member is opted out", async () => {
    mockPrisma.event.findUnique.mockResolvedValue(
      buildEvent([
        { email: "a@example.com", prefs: [{ eventNotifications: false, emailEnabled: true }] },
        { email: "b@example.com", prefs: [{ eventNotifications: true, emailEnabled: false }] },
      ])
    );

    await sendEventNotifications("evt1", "cancelled");

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("throws when the event does not exist", async () => {
    mockPrisma.event.findUnique.mockResolvedValue(null);

    await expect(sendEventNotifications("missing", "created")).rejects.toThrow("Event not found");
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe("sendRSVPReminders preference filtering", () => {
  const upcomingEvent = {
    id: "evt1",
    type: "PRACTICE",
    title: "Tuesday Practice",
    startAt: new Date("2026-01-03T15:00:00Z"),
    location: "Rink B",
    opponent: null,
    team: { name: "Sharks" },
    rsvps: [
      { user: { id: "u1", name: "One", email: "u1@example.com" } },
      { user: { id: "u2", name: "Two", email: "u2@example.com" } },
    ],
  };

  it("queries opt-outs for all pending users and skips opted-out ones", async () => {
    mockPrisma.event.findMany.mockResolvedValue([upcomingEvent]);
    mockPrisma.notificationPreference.findMany.mockResolvedValue([{ userId: "u2" }]);

    await sendRSVPReminders();

    expect(mockPrisma.notificationPreference.findMany).toHaveBeenCalledWith({
      where: {
        userId: { in: ["u1", "u2"] },
        OR: [{ emailEnabled: false }, { rsvpReminders: false }],
      },
      select: { userId: true },
    });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const message = mockSendEmail.mock.calls[0][0];
    expect(message.to).toEqual([{ email: "u1@example.com" }]);
  });

  it("sends to everyone when no opt-out rows exist", async () => {
    mockPrisma.event.findMany.mockResolvedValue([upcomingEvent]);
    mockPrisma.notificationPreference.findMany.mockResolvedValue([]);

    await sendRSVPReminders();

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    const recipients = mockSendEmail.mock.calls.map(([message]) => message.to[0].email);
    expect(recipients).toEqual(["u1@example.com", "u2@example.com"]);
  });

  it("sends nothing when every pending user opted out", async () => {
    mockPrisma.event.findMany.mockResolvedValue([upcomingEvent]);
    mockPrisma.notificationPreference.findMany.mockResolvedValue([
      { userId: "u1" },
      { userId: "u2" },
    ]);

    await sendRSVPReminders();

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("does not query preferences when no events are in the window", async () => {
    mockPrisma.event.findMany.mockResolvedValue([]);

    await sendRSVPReminders();

    expect(mockPrisma.notificationPreference.findMany).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe("existing-user membership notifications honor teamInvitations", () => {
  it("sendExistingUserNotification sends when the user has no preference rows", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ notificationPreferences: [] });

    await sendExistingUserNotification({
      email: "member@example.com",
      teamName: "Sharks",
      inviterName: "Coach",
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0].to).toEqual([{ email: "member@example.com" }]);
  });

  it("sendExistingUserNotification skips when teamInvitations is disabled", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      notificationPreferences: [{ teamInvitations: false, emailEnabled: true }],
    });

    await sendExistingUserNotification({
      email: "member@example.com",
      teamName: "Sharks",
      inviterName: "Coach",
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("sendExistingUserNotification skips when email is disabled entirely", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      notificationPreferences: [{ teamInvitations: true, emailEnabled: false }],
    });

    await sendExistingUserNotification({
      email: "member@example.com",
      teamName: "Sharks",
      inviterName: "Coach",
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("sendLeagueMemberAddedNotification skips opted-out users and sends otherwise", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      notificationPreferences: [{ teamInvitations: false, emailEnabled: true }],
    });

    await sendLeagueMemberAddedNotification({
      email: "member@example.com",
      leagueName: "Metro League",
      inviterName: "Admin",
      role: "TEAM_ADMIN",
    });

    expect(mockSendEmail).not.toHaveBeenCalled();

    mockPrisma.user.findUnique.mockResolvedValueOnce({ notificationPreferences: [] });

    await sendLeagueMemberAddedNotification({
      email: "member@example.com",
      leagueName: "Metro League",
      inviterName: "Admin",
      role: "TEAM_ADMIN",
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});
