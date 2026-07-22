/**
 * League-scope precedence for the remaining preference-gated email paths
 * (Track 2 review completeness). Verifies that a league-scoped opt-out row does
 * NOT suppress notifications in an unrelated league/team context, and that a
 * league override applies for events in that league — the same pickPreference
 * precedence used by sendEventNotifications/sendRSVPReminders.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSendEmail, mockPrisma } = vi.hoisted(() => ({
  mockSendEmail: vi.fn(),
  mockPrisma: {
    practiceSession: { findUnique: vi.fn() },
    signupEvent: { findMany: vi.fn() },
    gameProposal: { findUnique: vi.fn() },
    teamMember: { findMany: vi.fn() },
    notificationPreference: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/email/client", () => ({ sendEmail: mockSendEmail }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/utils/date", () => ({
  FALLBACK_TIME_ZONE: "America/New_York",
  formatDateTime: vi.fn(() => "Jan 1, 2026, 10:00 AM"),
}));
vi.mock("@/lib/env", () => ({ getBaseUrl: () => "http://localhost:3000" }));
vi.mock("@/lib/services/notification", () => ({ notificationService: {} }));

import {
  sendPracticePlanNotifications,
  sendGameProposalNotifications,
  sendSignupEventReminders,
} from "@/lib/email/templates";

beforeEach(() => {
  vi.clearAllMocks();
  mockSendEmail.mockResolvedValue(undefined);
});

describe("sendPracticePlanNotifications league scoping", () => {
  function buildSession(
    prefs: Array<{ leagueId: string | null; practicePlanNotifications: boolean; emailEnabled: boolean }>,
    teamLeagueId: string | null
  ) {
    return {
      id: "sess1",
      title: "Skills",
      date: new Date("2026-01-01T15:00:00Z"),
      duration: 60,
      teamId: "team1",
      team: {
        name: "Sharks",
        leagueId: teamLeagueId,
        members: [{ user: { id: "u1", email: "u1@example.com", notificationPreferences: prefs } }],
      },
      _count: { plays: 3 },
    };
  }

  it("a League-A opt-out does not suppress a standalone-team practice plan", async () => {
    mockPrisma.practiceSession.findUnique.mockResolvedValue(
      buildSession(
        [
          { leagueId: null, practicePlanNotifications: true, emailEnabled: true },
          { leagueId: "league-a", practicePlanNotifications: false, emailEnabled: true },
        ],
        null
      )
    );

    await sendPracticePlanNotifications("sess1", "team1", "shared");

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it("a League-A override suppresses a League-A team practice plan", async () => {
    mockPrisma.practiceSession.findUnique.mockResolvedValue(
      buildSession(
        [
          { leagueId: null, practicePlanNotifications: true, emailEnabled: true },
          { leagueId: "league-a", practicePlanNotifications: false, emailEnabled: true },
        ],
        "league-a"
      )
    );

    await sendPracticePlanNotifications("sess1", "team1", "updated");

    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe("sendGameProposalNotifications league scoping", () => {
  function buildProposal() {
    return {
      id: "prop1",
      leagueId: "league-a",
      proposingTeam: { id: "teamP", name: "Proposers" },
      receivingTeam: { id: "teamR", name: "Receivers" },
      entries: [
        {
          kind: "PROPOSE",
          actorTeamId: "teamP",
          venue: { name: "Rink", timezone: "America/New_York" },
          startAt: new Date("2026-01-05T15:00:00Z"),
          endAt: new Date("2026-01-05T17:00:00Z"),
          note: null,
        },
      ],
    };
  }

  it("suppresses a recipient admin whose League-A override disables event notifications", async () => {
    mockPrisma.gameProposal.findUnique.mockResolvedValue(buildProposal());
    mockPrisma.teamMember.findMany.mockResolvedValue([
      {
        user: {
          email: "admin@example.com",
          notificationPreferences: [
            { leagueId: null, eventNotifications: true, emailEnabled: true },
            { leagueId: "league-a", eventNotifications: false, emailEnabled: true },
          ],
        },
      },
    ]);

    await sendGameProposalNotifications("prop1", "created");

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("does not let an unrelated League-B opt-out suppress a League-A proposal", async () => {
    mockPrisma.gameProposal.findUnique.mockResolvedValue(buildProposal());
    mockPrisma.teamMember.findMany.mockResolvedValue([
      {
        user: {
          email: "admin@example.com",
          notificationPreferences: [
            { leagueId: null, eventNotifications: true, emailEnabled: true },
            { leagueId: "league-b", eventNotifications: false, emailEnabled: true },
          ],
        },
      },
    ]);

    await sendGameProposalNotifications("prop1", "created");

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("sendSignupEventReminders league scoping", () => {
  function buildEvent() {
    return {
      id: "se1",
      title: "Tryouts",
      startAt: new Date("2026-01-03T15:00:00Z"),
      locationText: "Rink B",
      venue: null,
      hostOrganization: null,
      hostLeague: { id: "league-a", name: "Metro" },
      hostTeam: null,
      registrations: [
        { participantName: "Kid One", registrant: { id: "u1", email: "u1@example.com" } },
      ],
    };
  }

  it("does not let a League-B opt-out skip a League-A-hosted reminder", async () => {
    mockPrisma.signupEvent.findMany.mockResolvedValue([buildEvent()]);
    mockPrisma.notificationPreference.findMany.mockResolvedValue([
      { userId: "u1", leagueId: "league-b", emailEnabled: true, rsvpReminders: false },
    ]);

    await sendSignupEventReminders();

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it("honors a global rsvpReminders opt-out for a League-A-hosted reminder", async () => {
    mockPrisma.signupEvent.findMany.mockResolvedValue([buildEvent()]);
    mockPrisma.notificationPreference.findMany.mockResolvedValue([
      { userId: "u1", leagueId: null, emailEnabled: true, rsvpReminders: false },
    ]);

    await sendSignupEventReminders();

    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
