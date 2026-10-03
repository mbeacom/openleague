import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    practiceSession: { findUnique: vi.fn() },
    teamMember: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/session", () => ({
  requireUserId: vi.fn().mockResolvedValue("cuserxxxxxxxxxxxxxxxxxxxx"),
}));

import { getPracticeSessionDetail, getPracticeSessionForEdit } from "@/lib/actions/practice-session-queries";
import { createEmptyPlayData } from "@/lib/utils/play-data";

function row(id: string, sequence: number, runsWithPrevious = false) {
  return {
    id,
    sequence,
    duration: 10,
    instructions: null,
    runsWithPrevious,
    play: { id: `play-${id}`, name: id, description: null, thumbnail: null, playData: null },
  };
}

describe("getPracticeSessionForEdit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.teamMember.findFirst.mockResolvedValue({ id: "m" });
  });

  it("renumbers plays to consecutive 0-based sequences when the DB has gaps", async () => {
    // A deleted library play cascades its PracticeSessionPlay row away,
    // leaving sequences [0, 2].
    mockPrisma.practiceSession.findUnique.mockResolvedValue({
      id: "s1",
      teamId: "t1",
      title: "T",
      date: new Date("2026-01-01T00:00:00Z"),
      duration: 60,
      isShared: false,
      venueId: null,
      surfaceId: null,
      segmentId: null,
      startAt: null,
      plays: [row("a", 0), row("b", 2)],
    });

    const result = await getPracticeSessionForEdit("s1");

    expect(result?.initialData.plays.map((p) => p.sequence)).toEqual([0, 1]);
    expect(result?.initialData.plays.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("returns each drill's name and description", async () => {
    mockPrisma.practiceSession.findUnique.mockResolvedValue({
      id: "s1", teamId: "t1", title: "T", date: new Date("2026-01-01T00:00:00Z"), duration: 60, isShared: false,
      venueId: null, surfaceId: null, segmentId: null, startAt: null,
      plays: [row("a", 0)],
    });
    const result = await getPracticeSessionForEdit("s1");
    expect(result?.initialData.plays[0]).toMatchObject({ name: "a", description: "" });
  });

  it("normalizes station flags with the sequences: the first drill never runs with a previous one", async () => {
    // A pre-3a cascade could delete a block's first drill and leave its stations behind.
    mockPrisma.practiceSession.findUnique.mockResolvedValue({
      id: "s1", teamId: "t1", title: "T", date: new Date("2026-01-01T00:00:00Z"), duration: 60, isShared: false,
      venueId: null, surfaceId: null, segmentId: null, startAt: null,
      plays: [row("a", 1, true), row("b", 2, true), row("c", 3, false)],
    });

    const result = await getPracticeSessionForEdit("s1");

    expect(result?.initialData.plays.map((p) => [p.id, p.sequence, p.runsWithPrevious])).toEqual([
      ["a", 0, false],
      ["b", 1, true],
      ["c", 2, false],
    ]);
  });

  it("flags a drill whose diagram couldn't be read, so the editor skips its station warnings", async () => {
    const readable = { ...row("b", 1), play: { ...row("b", 1).play, playData: createEmptyPlayData() } };
    mockPrisma.practiceSession.findUnique.mockResolvedValue({
      id: "s1", teamId: "t1", title: "T", date: new Date("2026-01-01T00:00:00Z"), duration: 60, isShared: false,
      venueId: null, surfaceId: null, segmentId: null, startAt: null,
      plays: [row("a", 0), readable],
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await getPracticeSessionForEdit("s1");

    const [unreadable, ok] = result!.initialData.plays;
    expect(unreadable.playDataUnreadable).toBe(true);
    expect(unreadable.playData).toEqual(createEmptyPlayData()); // still an empty board for the editor
    expect(ok.playDataUnreadable).toBeFalsy();
  });
});

describe("getPracticeSessionDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.teamMember.findFirst.mockResolvedValue({ id: "m", role: "ADMIN" });
  });

  it("returns each drill's station flag and the booked segment's kind", async () => {
    mockPrisma.practiceSession.findUnique.mockResolvedValue({
      id: "s1", teamId: "t1", title: "T", date: new Date("2026-01-01T00:00:00Z"), duration: 60, isShared: false,
      createdBy: { name: "Coach" }, team: { id: "t1", name: "Team" },
      venueId: "v1", venue: { name: "Rink" }, surfaceId: "sf1", surface: { name: "Main" },
      segmentId: "sg1", segment: { name: "Half A", kind: "HALF" }, startAt: null,
      plays: [row("a", 0, false), row("b", 1, true)],
    });

    const result = await getPracticeSessionDetail("s1");

    expect(result?.session.segmentKind).toBe("HALF");
    expect(result?.session.plays.map((p) => p.runsWithPrevious)).toEqual([false, true]);
    expect(mockPrisma.practiceSession.findUnique.mock.calls[0][0].include.segment).toEqual({ select: { name: true, kind: true } });
  });

  it("reads an unbooked session's segment kind as null", async () => {
    mockPrisma.practiceSession.findUnique.mockResolvedValue({
      id: "s1", teamId: "t1", title: "T", date: new Date("2026-01-01T00:00:00Z"), duration: 60, isShared: false,
      createdBy: { name: "Coach" }, team: { id: "t1", name: "Team" },
      venueId: null, venue: null, surfaceId: null, surface: null, segmentId: null, segment: null, startAt: null,
      plays: [],
    });

    expect((await getPracticeSessionDetail("s1"))?.session.segmentKind).toBeNull();
  });
});

describe("getPracticeSessionDetail: venue timezone and unchanged access (3b)", () => {
  function detailRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "s1", teamId: "t1", title: "T", date: new Date("2026-04-07T22:00:00Z"), duration: 60, isShared: false,
      createdBy: { name: "Coach" }, team: { id: "t1", name: "Team" },
      venueId: "v1", venue: { name: "Rink", timezone: "America/Denver" },
      surfaceId: null, surface: null, segmentId: null, segment: null,
      startAt: new Date("2026-04-08T00:00:00Z"),
      plays: [],
      ...overrides,
    };
  }

  /** The query reads membership twice: any team (first), then the session's team (second). */
  function memberships(sessionTeam: { role: "ADMIN" | "MEMBER" } | null) {
    mockPrisma.teamMember.findFirst
      .mockResolvedValueOnce({ id: "m-any", role: "MEMBER" })
      .mockResolvedValueOnce(sessionTeam ? { id: "m", ...sessionTeam } : null);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.teamMember.findFirst.mockReset();
  });

  it("returns the venue's timezone, selected alongside its name", async () => {
    memberships({ role: "ADMIN" });
    mockPrisma.practiceSession.findUnique.mockResolvedValue(detailRow());

    const result = await getPracticeSessionDetail("s1");

    expect(result?.session.venueTimezone).toBe("America/Denver");
    expect(mockPrisma.practiceSession.findUnique.mock.calls[0][0].include.venue).toEqual({
      select: { name: true, timezone: true },
    });
  });

  it("returns a null timezone for an unbooked session", async () => {
    memberships({ role: "ADMIN" });
    mockPrisma.practiceSession.findUnique.mockResolvedValue(detailRow({ venueId: null, venue: null, startAt: null }));

    expect((await getPracticeSessionDetail("s1"))?.session.venueTimezone).toBeNull();
  });

  it.each([
    ["an admin, unshared", { role: "ADMIN" as const }, false, true],
    ["a member, shared", { role: "MEMBER" as const }, true, true],
    ["a member, unshared", { role: "MEMBER" as const }, false, false],
    ["a non-member, shared", null, true, false],
  ])("keeps the access rule: %s", async (_label, sessionTeam, isShared, visible) => {
    memberships(sessionTeam);
    mockPrisma.practiceSession.findUnique.mockResolvedValue(detailRow({ isShared }));

    const result = await getPracticeSessionDetail("s1");

    expect(result !== null).toBe(visible);
  });
});
