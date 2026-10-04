import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    practiceSession: { findUnique: vi.fn(), findMany: vi.fn() },
    teamMember: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/session", () => ({
  requireUserId: vi.fn().mockResolvedValue("cuserxxxxxxxxxxxxxxxxxxxx"),
}));

import { getPracticePlannerListData, getPracticeSessionDetail, getPracticeSessionForEdit } from "@/lib/actions/practice-session-queries";
import { drillRows, isDrillRow } from "@/lib/utils/session-rows";
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

    const [unreadable, ok] = drillRows(result!.initialData.plays);
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
    ["an admin, unshared", { role: "ADMIN" as const }, false, true, true],
    ["a member, shared", { role: "MEMBER" as const }, true, true, false],
    ["a member, unshared", { role: "MEMBER" as const }, false, false, undefined],
    ["a non-member, shared", null, true, false, undefined],
  ])("keeps the access rule: %s", async (_label, sessionTeam, isShared, visible, isAdmin) => {
    memberships(sessionTeam);
    mockPrisma.practiceSession.findUnique.mockResolvedValue(detailRow({ isShared }));

    const result = await getPracticeSessionDetail("s1");

    expect(result !== null).toBe(visible);
    if (visible) expect(result?.isAdmin).toBe(isAdmin);
  });
});

describe("goaltender fields in the session queries", () => {
    const base = {
        id: "s1", teamId: "t1", title: "T", date: new Date("2026-01-01T00:00:00Z"), duration: 60, isShared: true,
        venueId: null, surfaceId: null, segmentId: null, startAt: null, goaliesAttending: 1,
        createdBy: { name: "Coach" }, team: { id: "t1", name: "Team" }, venue: null, surface: null, segment: null,
        plays: [{ ...row("a", 0), play: { ...row("a", 0).play, focus: "goalies", goalies: "required" } }, row("b", 1)],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockPrisma.teamMember.findFirst.mockResolvedValue({ id: "m", role: "ADMIN", teamId: "t1" });
        mockPrisma.practiceSession.findUnique.mockResolvedValue(base);
    });

    it("getPracticeSessionForEdit returns the count and each drill's tags (defaults when untagged)", async () => {
        const result = await getPracticeSessionForEdit("s1");
        expect(result?.initialData.goaliesAttending).toBe(1);
        expect(drillRows(result!.initialData.plays).map((p) => [p.focus, p.goalies])).toEqual([["goalies", "required"], ["team", "optional"]]);
        const select = mockPrisma.practiceSession.findUnique.mock.calls[0][0].include.plays.include.play.select;
        expect(select).toMatchObject({ focus: true, goalies: true });
    });

    it("getPracticeSessionDetail returns the count and each drill's tags", async () => {
        const result = await getPracticeSessionDetail("s1");
        expect(result?.session.goaliesAttending).toBe(1);
        expect(drillRows(result!.session.plays).map((p) => [p.play.focus, p.play.goalies])).toEqual([["goalies", "required"], ["team", "optional"]]);
    });
});

describe("practice timing in the session queries", () => {
    const blockRow = {
        id: "w", sequence: 0, duration: 8, instructions: "Easy laps", runsWithPrevious: false,
        kind: "warmup", label: null, stays: false, rotateEveryMinutes: null, play: null,
    };
    const base = {
        id: "s1", teamId: "t1", title: "T", date: new Date("2026-01-01T00:00:00Z"), duration: 60, isShared: true,
        venueId: null, surfaceId: null, segmentId: null, startAt: null, goaliesAttending: null, transitionMinutes: 2,
        createdBy: { name: "Coach" }, team: { id: "t1", name: "Team" }, venue: null, surface: null, segment: null,
        plays: [
            blockRow,
            { ...row("a", 1), kind: "drill", label: null, stays: false, rotateEveryMinutes: 5 },
            { ...row("b", 2, true), kind: "drill", label: null, stays: false, rotateEveryMinutes: null },
        ],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockPrisma.teamMember.findFirst.mockResolvedValue({ id: "m", role: "ADMIN", teamId: "t1", team: { id: "t1", name: "Team" } });
        mockPrisma.practiceSession.findUnique.mockResolvedValue(base);
    });

    it("getPracticeSessionDetail returns block rows, each drill's timing and the gap", async () => {
        const result = await getPracticeSessionDetail("s1");
        expect(result?.session.transitionMinutes).toBe(2);
        expect(result?.session.plays[0]).toEqual({
            id: "w", kind: "warmup", label: null, sequence: 0, duration: 8, instructions: "Easy laps", runsWithPrevious: false,
        });
        expect(result?.session.plays.slice(1).map((p) => isDrillRow(p) && [p.stays, p.rotateEveryMinutes])).toEqual([[false, 5], [false, null]]);
    });

    it("getPracticeSessionForEdit returns block items and each drill's stored timing, so an untouched editor saves them back", async () => {
        const result = await getPracticeSessionForEdit("s1");
        expect(result?.initialData.transitionMinutes).toBe(2);
        expect(result?.initialData.plays[0]).toEqual({
            id: "w", kind: "warmup", label: "", sequence: 0, duration: 8, instructions: "Easy laps", runsWithPrevious: false,
        });
        expect(result?.initialData.plays[1]).toMatchObject({ playId: "play-a", stays: false, rotateEveryMinutes: 5 });
    });

    it("getPracticePlannerListData pictures and counts drills only", async () => {
        mockPrisma.practiceSession.findMany.mockResolvedValue([]);
        await getPracticePlannerListData();
        const include = mockPrisma.practiceSession.findMany.mock.calls[0][0].include;
        expect(include.plays).toMatchObject({ where: { kind: "drill" }, take: 1 });
        expect(include._count).toEqual({ select: { plays: { where: { kind: "drill" } } } });
    });
});
