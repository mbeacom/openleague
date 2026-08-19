import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEvent, mockTeamMember, mockLeagueUser, mockRsvp, mockRequireUserId } =
  vi.hoisted(() => ({
    mockEvent: { findUnique: vi.fn() },
    mockTeamMember: { findUnique: vi.fn() },
    mockLeagueUser: { findFirst: vi.fn() },
    mockRsvp: { findMany: vi.fn() },
    mockRequireUserId: vi.fn(),
  }));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    event: mockEvent,
    teamMember: mockTeamMember,
    leagueUser: mockLeagueUser,
    rSVP: mockRsvp,
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireUserId: mockRequireUserId,
  requireTeamMember: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getEventAttendance } from "@/lib/actions/rsvp";

const EVENT = "clfevent000000000000000001";
const LEAGUE = "clfleague0000000000000001";
const TEAM = "clfteam00000000000000001";

/**
 * Two guardians answer for two different children on the same event. The
 * responder identity is family information: organizers may see it, ordinary
 * team members may not (spec 007 US3, acceptance scenario 4).
 */
const rsvpRows = [
  {
    status: "GOING",
    playerId: "player-1",
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    user: { name: "Dana Bouchard", email: "dana@example.com" },
    player: { id: "player-1", name: "Dylan Bouchard" },
  },
  {
    status: "MAYBE",
    playerId: "player-2",
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    user: { name: null, email: "kowalski.household@example.com" },
    player: { id: "player-2", name: "Sam Kowalski" },
  },
];

describe("per-child attendance privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUserId.mockResolvedValue("viewer-1");
    mockEvent.findUnique.mockResolvedValue({
      id: EVENT,
      teamId: TEAM,
      leagueId: LEAGUE,
      team: { leagueId: LEAGUE },
    });
    mockRsvp.findMany.mockResolvedValue(rsvpRows);
    mockLeagueUser.findFirst.mockResolvedValue(null);
  });

  it("tracks attendance per child for an ordinary team member", async () => {
    mockTeamMember.findUnique.mockResolvedValue({ role: "MEMBER" });

    const result = await getEventAttendance(EVENT);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const players = result.data.entries.filter((entry) => entry.kind === "player");
    expect(players.map((entry) => entry.name).sort()).toEqual([
      "Dylan Bouchard",
      "Sam Kowalski",
    ]);
    expect(result.data.counts.GOING).toBe(1);
    expect(result.data.counts.MAYBE).toBe(1);
  });

  it("hides the responding guardian from an ordinary team member", async () => {
    mockTeamMember.findUnique.mockResolvedValue({ role: "MEMBER" });

    const result = await getEventAttendance(EVENT);

    expect(result.success).toBe(true);
    if (!result.success) return;

    for (const entry of result.data.entries) {
      expect(entry.respondedByName).toBeUndefined();
    }

    // Belt and braces: no guardian name or address anywhere in the payload,
    // however the shape changes later.
    const serialized = JSON.stringify(result.data);
    expect(serialized).not.toContain("Dana Bouchard");
    expect(serialized).not.toContain("dana@example.com");
    expect(serialized).not.toContain("kowalski.household@example.com");
  });

  it("shows the responding guardian to a team admin", async () => {
    mockTeamMember.findUnique.mockResolvedValue({ role: "ADMIN" });

    const result = await getEventAttendance(EVENT);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const dylan = result.data.entries.find((entry) => entry.name === "Dylan Bouchard");
    expect(dylan?.respondedByName).toBe("Dana Bouchard");
  });

  it("shows the responding guardian to a league admin who is not on the team", async () => {
    mockTeamMember.findUnique.mockResolvedValue(null);
    mockLeagueUser.findFirst.mockResolvedValue({ id: "league-admin-row" });

    const result = await getEventAttendance(EVENT);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const sam = result.data.entries.find((entry) => entry.name === "Sam Kowalski");
    // Falls back to the address only because this account has no display name.
    expect(sam?.respondedByName).toBe("kowalski.household@example.com");
  });

  it("refuses a viewer with no relationship to the event", async () => {
    mockTeamMember.findUnique.mockResolvedValue(null);
    mockLeagueUser.findFirst.mockResolvedValue(null);

    const result = await getEventAttendance(EVENT);

    expect(result.success).toBe(false);
  });

  it("keeps one entry per child when several people answered", async () => {
    mockTeamMember.findUnique.mockResolvedValue({ role: "ADMIN" });
    mockRsvp.findMany.mockResolvedValue([
      ...rsvpRows,
      {
        status: "NOT_GOING",
        playerId: "player-1",
        updatedAt: new Date("2026-01-03T00:00:00Z"),
        user: { name: "Second Guardian", email: "second@example.com" },
        player: { id: "player-1", name: "Dylan Bouchard" },
      },
    ]);

    const result = await getEventAttendance(EVENT);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const dylanEntries = result.data.entries.filter(
      (entry) => entry.name === "Dylan Bouchard",
    );
    expect(dylanEntries).toHaveLength(1);
    // Latest response wins, and it carries that responder's name.
    expect(dylanEntries[0].status).toBe("NOT_GOING");
    expect(dylanEntries[0].respondedByName).toBe("Second Guardian");
  });
});
