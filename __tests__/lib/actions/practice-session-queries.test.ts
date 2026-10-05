import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    practiceSession: { findUnique: vi.fn(), findMany: vi.fn() },
    teamMember: { findFirst: vi.fn(), findMany: vi.fn() },
    teamOfficial: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/session", () => ({
  requireUserId: vi.fn().mockResolvedValue("cuserxxxxxxxxxxxxxxxxxxxx"),
}));

import { getPracticePlannerListData, getPracticeSessionDetail, getPracticeSessionForEdit, getPracticeStaffOptions } from "@/lib/actions/practice-session-queries";
import { drillRows, isDrillRow } from "@/lib/utils/session-rows";
import { requireUserId } from "@/lib/auth/session";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const SESSION_ID = "clsession00000000000000001";

function row(id: string, sequence: number, runsWithPrevious = false) {
  return {
    id,
    sequence,
    duration: 10,
    instructions: null,
    runsWithPrevious,
    play: { id: `play-${id}`, name: id, description: null, thumbnail: null, playData: null },
    staff: [] as Array<{ staffId: string }>,
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
      staff: [],
      plays: [row("a", 0), row("b", 2)],
    });

    const result = await getPracticeSessionForEdit(SESSION_ID);

    expect(result?.initialData.plays.map((p) => p.sequence)).toEqual([0, 1]);
    expect(result?.initialData.plays.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("returns each drill's name and description", async () => {
    mockPrisma.practiceSession.findUnique.mockResolvedValue({
      id: "s1", teamId: "t1", title: "T", date: new Date("2026-01-01T00:00:00Z"), duration: 60, isShared: false,
      venueId: null, surfaceId: null, segmentId: null, startAt: null, staff: [],
      plays: [row("a", 0)],
    });
    const result = await getPracticeSessionForEdit(SESSION_ID);
    expect(result?.initialData.plays[0]).toMatchObject({ name: "a", description: "" });
  });

  it("normalizes station flags with the sequences: the first drill never runs with a previous one", async () => {
    // A pre-3a cascade could delete a block's first drill and leave its stations behind.
    mockPrisma.practiceSession.findUnique.mockResolvedValue({
      id: "s1", teamId: "t1", title: "T", date: new Date("2026-01-01T00:00:00Z"), duration: 60, isShared: false,
      venueId: null, surfaceId: null, segmentId: null, startAt: null, staff: [],
      plays: [row("a", 1, true), row("b", 2, true), row("c", 3, false)],
    });

    const result = await getPracticeSessionForEdit(SESSION_ID);

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
      venueId: null, surfaceId: null, segmentId: null, startAt: null, staff: [],
      plays: [row("a", 0), readable],
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await getPracticeSessionForEdit(SESSION_ID);

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
      segmentId: "sg1", segment: { name: "Half A", kind: "HALF" }, startAt: null, staff: [],
      plays: [row("a", 0, false), row("b", 1, true)],
    });

    const result = await getPracticeSessionDetail(SESSION_ID);

    expect(result?.session.segmentKind).toBe("HALF");
    expect(result?.session.plays.map((p) => p.runsWithPrevious)).toEqual([false, true]);
    expect(mockPrisma.practiceSession.findUnique.mock.calls[0][0].include.segment).toEqual({ select: { name: true, kind: true } });
  });

  it("reads an unbooked session's segment kind as null", async () => {
    mockPrisma.practiceSession.findUnique.mockResolvedValue({
      id: "s1", teamId: "t1", title: "T", date: new Date("2026-01-01T00:00:00Z"), duration: 60, isShared: false,
      createdBy: { name: "Coach" }, team: { id: "t1", name: "Team" },
      venueId: null, venue: null, surfaceId: null, surface: null, segmentId: null, segment: null, startAt: null, staff: [],
      plays: [],
    });

    expect((await getPracticeSessionDetail(SESSION_ID))?.session.segmentKind).toBeNull();
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
      staff: [],
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

    const result = await getPracticeSessionDetail(SESSION_ID);

    expect(result?.session.venueTimezone).toBe("America/Denver");
    expect(mockPrisma.practiceSession.findUnique.mock.calls[0][0].include.venue).toEqual({
      select: { name: true, timezone: true },
    });
  });

  it("returns a null timezone for an unbooked session", async () => {
    memberships({ role: "ADMIN" });
    mockPrisma.practiceSession.findUnique.mockResolvedValue(detailRow({ venueId: null, venue: null, startAt: null }));

    expect((await getPracticeSessionDetail(SESSION_ID))?.session.venueTimezone).toBeNull();
  });

  it.each([
    ["an admin, unshared", { role: "ADMIN" as const }, false, true, true],
    ["a member, shared", { role: "MEMBER" as const }, true, true, false],
    ["a member, unshared", { role: "MEMBER" as const }, false, false, undefined],
    ["a non-member, shared", null, true, false, undefined],
  ])("keeps the access rule: %s", async (_label, sessionTeam, isShared, visible, isAdmin) => {
    memberships(sessionTeam);
    mockPrisma.practiceSession.findUnique.mockResolvedValue(detailRow({ isShared }));

    const result = await getPracticeSessionDetail(SESSION_ID);

    expect(result !== null).toBe(visible);
    if (visible) expect(result?.isAdmin).toBe(isAdmin);
  });
});

describe("goaltender fields in the session queries", () => {
    const base = {
        id: "s1", teamId: "t1", title: "T", date: new Date("2026-01-01T00:00:00Z"), duration: 60, isShared: true,
        venueId: null, surfaceId: null, segmentId: null, startAt: null, goaliesAttending: 1,
        createdBy: { name: "Coach" }, team: { id: "t1", name: "Team" }, venue: null, surface: null, segment: null, staff: [],
        plays: [{ ...row("a", 0), play: { ...row("a", 0).play, focus: "goalies", goalies: "required" } }, row("b", 1)],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockPrisma.teamMember.findFirst.mockResolvedValue({ id: "m", role: "ADMIN", teamId: "t1" });
        mockPrisma.practiceSession.findUnique.mockResolvedValue(base);
    });

    it("getPracticeSessionForEdit returns the count and each drill's tags (defaults when untagged)", async () => {
        const result = await getPracticeSessionForEdit(SESSION_ID);
        expect(result?.initialData.goaliesAttending).toBe(1);
        expect(drillRows(result!.initialData.plays).map((p) => [p.focus, p.goalies])).toEqual([["goalies", "required"], ["team", "optional"]]);
        const select = mockPrisma.practiceSession.findUnique.mock.calls[0][0].include.plays.include.play.select;
        expect(select).toMatchObject({ focus: true, goalies: true });
    });

    it("getPracticeSessionDetail returns the count and each drill's tags", async () => {
        const result = await getPracticeSessionDetail(SESSION_ID);
        expect(result?.session.goaliesAttending).toBe(1);
        expect(drillRows(result!.session.plays).map((p) => [p.play.focus, p.play.goalies])).toEqual([["goalies", "required"], ["team", "optional"]]);
    });
});

describe("practice timing in the session queries", () => {
    const blockRow = {
        id: "w", sequence: 0, duration: 8, instructions: "Easy laps", runsWithPrevious: false,
        kind: "warmup", label: null, stays: false, rotateEveryMinutes: null, play: null, staff: [],
    };
    const base = {
        id: "s1", teamId: "t1", title: "T", date: new Date("2026-01-01T00:00:00Z"), duration: 60, isShared: true,
        venueId: null, surfaceId: null, segmentId: null, startAt: null, goaliesAttending: null, transitionMinutes: 2,
        createdBy: { name: "Coach" }, team: { id: "t1", name: "Team" }, venue: null, surface: null, segment: null, staff: [],
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
        const result = await getPracticeSessionDetail(SESSION_ID);
        expect(result?.session.transitionMinutes).toBe(2);
        expect(result?.session.plays[0]).toEqual({
            id: "w", kind: "warmup", label: null, sequence: 0, duration: 8, instructions: "Easy laps", runsWithPrevious: false, staff: [],
        });
        expect(result?.session.plays.slice(1).map((p) => isDrillRow(p) && [p.stays, p.rotateEveryMinutes])).toEqual([[false, 5], [false, null]]);
    });

    it("getPracticeSessionForEdit returns block items and each drill's stored timing, so an untouched editor saves them back", async () => {
        const result = await getPracticeSessionForEdit(SESSION_ID);
        expect(result?.initialData.transitionMinutes).toBe(2);
        expect(result?.initialData.plays[0]).toEqual({
            id: "w", kind: "warmup", label: "", sequence: 0, duration: 8, instructions: "Easy laps", runsWithPrevious: false, staff: [],
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

describe("practice staff in the session queries (spec R4, R9)", () => {
    const session = {
        id: "s1", teamId: "t1", title: "T", date: new Date("2026-01-01T00:00:00Z"), duration: 60, isShared: true,
        venueId: null, surfaceId: null, segmentId: null, startAt: null, goaliesAttending: null, transitionMinutes: 0,
        createdBy: { name: "Coach" }, team: { id: "t1", name: "Team" }, venue: null, surface: null, segment: null,
        staff: [
            { id: "st1", name: "Coach Lee", teamOfficialId: "off-active", userId: null, teamOfficial: { status: "ACTIVE" } },
            { id: "st2", name: "Pat", teamOfficialId: "off-removed", userId: null, teamOfficial: { status: "REMOVED" } },
            { id: "st3", name: "Alex", teamOfficialId: null, userId: "u-admin", teamOfficial: null },
            { id: "st4", name: "Jo", teamOfficialId: null, userId: "u-demoted", teamOfficial: null },
            { id: "st5", name: "Sam", teamOfficialId: null, userId: null, teamOfficial: null },
        ],
        plays: [
            { ...row("a", 0), kind: "drill", label: null, stays: false, rotateEveryMinutes: null, staff: [{ staffId: "st5" }, { staffId: "st1" }] },
            { id: "w", sequence: 1, duration: 5, instructions: null, runsWithPrevious: false, kind: "cooldown", label: null, stays: false, rotateEveryMinutes: null, play: null, staff: [{ staffId: "st3" }] },
        ],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockPrisma.teamMember.findFirst.mockResolvedValue({ id: "m", role: "ADMIN", teamId: "t1" });
        mockPrisma.teamMember.findMany.mockResolvedValue([{ userId: "u-admin" }]);
        mockPrisma.practiceSession.findUnique.mockResolvedValue(session);
    });

    it("getPracticeSessionDetail returns the list (names only) and each row's staff ids in order", async () => {
        const result = await getPracticeSessionDetail(SESSION_ID);
        expect(result?.session.staff).toEqual([
            { id: "st1", name: "Coach Lee" }, { id: "st2", name: "Pat" }, { id: "st3", name: "Alex" }, { id: "st4", name: "Jo" }, { id: "st5", name: "Sam" },
        ]);
        expect(result?.session.plays.map((row) => row.staff)).toEqual([["st5", "st1"], ["st3"]]);
        const include = mockPrisma.practiceSession.findUnique.mock.calls[0][0].include;
        expect(include.staff).toEqual({ orderBy: { position: "asc" }, select: { id: true, name: true } });
        expect(include.plays.include.staff).toEqual({ orderBy: { position: "asc" }, select: { staffId: true } });
    });

    it("getPracticeSessionForEdit keeps valid links and loads a stale one unlinked (Review Focus 2)", async () => {
        const result = await getPracticeSessionForEdit(SESSION_ID);
        expect(result?.initialData.staff).toEqual([
            { id: "st1", name: "Coach Lee", teamOfficialId: "off-active", userId: null },
            { id: "st2", name: "Pat", teamOfficialId: null, userId: null },
            { id: "st3", name: "Alex", teamOfficialId: null, userId: "u-admin" },
            { id: "st4", name: "Jo", teamOfficialId: null, userId: null },
            { id: "st5", name: "Sam", teamOfficialId: null, userId: null },
        ]);
        expect(mockPrisma.teamMember.findMany).toHaveBeenCalledWith({
            where: { teamId: "t1", role: "ADMIN", userId: { in: ["u-admin", "u-demoted"] } },
            select: { userId: true },
        });
        expect(result?.initialData.plays.map((item) => item.staff)).toEqual([["st5", "st1"], ["st3"]]);
    });

    it("getPracticeSessionForEdit asks for no admins when nobody is linked to an account", async () => {
        mockPrisma.practiceSession.findUnique.mockResolvedValue({ ...session, staff: [session.staff[4]] });
        await getPracticeSessionForEdit(SESSION_ID);
        expect(mockPrisma.teamMember.findMany).not.toHaveBeenCalled();
    });
});

describe("getPracticeStaffOptions (spec R4)", () => {
    const TEAM_ID = "cteamxxxxxxxxxxxxxxxxxxxx";

    beforeEach(() => {
        vi.clearAllMocks();
        mockPrisma.teamMember.findFirst.mockResolvedValue({ id: "m" });
        mockPrisma.teamOfficial.findMany.mockResolvedValue([
            { id: "o1", name: "Lee Park", role: "HEAD_COACH", userId: "u1" },
            { id: "o2", name: "x".repeat(80), role: "PARENT_VOLUNTEER", userId: null },
        ]);
        mockPrisma.teamMember.findMany.mockResolvedValue([
            { userId: "u1", user: { name: "Lee Park" } },
            { userId: "u2", user: { name: "Alex Admin" } },
            { userId: "u3", user: { name: null } },
        ]);
    });

    it("lists active and invited officials, then admins who aren't officials, never an unnamed admin", async () => {
        const options = await getPracticeStaffOptions(TEAM_ID);
        expect(options).toEqual([
            { kind: "official", id: "o1", name: "Lee Park", roleLabel: "Head Coach" },
            { kind: "official", id: "o2", name: "x".repeat(60), roleLabel: "Parent Volunteer" },
            { kind: "admin", id: "u2", name: "Alex Admin", roleLabel: "Team admin" },
        ]);
        expect(mockPrisma.teamOfficial.findMany).toHaveBeenCalledWith({
            where: { teamId: TEAM_ID, status: { in: ["ACTIVE", "INVITED"] } },
            orderBy: [{ role: "asc" }, { name: "asc" }],
            select: { id: true, name: true, role: true, userId: true },
        });
    });

    it("never selects or returns an email", async () => {
        const options = await getPracticeStaffOptions(TEAM_ID);
        expect(JSON.stringify(mockPrisma.teamOfficial.findMany.mock.calls)).not.toContain("email");
        expect(JSON.stringify(mockPrisma.teamMember.findMany.mock.calls)).not.toContain("email");
        for (const option of options) expect(Object.keys(option).sort()).toEqual(["id", "kind", "name", "roleLabel"]);
    });

    it("gives a caller who isn't an admin of the team nothing, without reading anyone", async () => {
        mockPrisma.teamMember.findFirst.mockResolvedValue(null);
        expect(await getPracticeStaffOptions(TEAM_ID)).toEqual([]);
        expect(mockPrisma.teamMember.findFirst).toHaveBeenCalledWith({
            where: { userId: "cuserxxxxxxxxxxxxxxxxxxxx", teamId: TEAM_ID, role: "ADMIN" },
            select: { id: true },
        });
        expect(mockPrisma.teamOfficial.findMany).not.toHaveBeenCalled();
    });

    it("leaves out an official whose name cleans to nothing", async () => {
        mockPrisma.teamOfficial.findMany.mockResolvedValue([
            { id: "o1", name: "\u0001 ", role: "HEAD_COACH", userId: null },
            { id: "o2", name: "Lee Park", role: "ASSISTANT_COACH", userId: null },
        ]);
        mockPrisma.teamMember.findMany.mockResolvedValue([]);
        expect((await getPracticeStaffOptions(TEAM_ID)).map((option) => option.id)).toEqual(["o2"]);
    });

    it.each([
        ["an object", { not: "x" }],
        ["an array", [TEAM_ID]],
        ["a string that isn't a cuid", "t1"],
    ])("validates its team id: %s gets nothing and reads nothing", async (_label, teamId) => {
        expect(await getPracticeStaffOptions(teamId as unknown as string)).toEqual([]);
        expect(requireUserId).not.toHaveBeenCalled();
        expect(mockPrisma.teamMember.findFirst).not.toHaveBeenCalled();
        expect(mockPrisma.teamMember.findMany).not.toHaveBeenCalled();
        expect(mockPrisma.teamOfficial.findMany).not.toHaveBeenCalled();
    });
});

describe("getPracticeSessionDetail: the team mark (practice logo spec R5)", () => {
  const DETAIL = {
    id: "s1", teamId: "t1", title: "T", date: new Date("2026-04-07T22:00:00Z"), duration: 60, isShared: false,
    createdBy: { name: "Coach" }, venue: null, surface: null, segment: null, staff: [], plays: [],
    team: { id: "t1", name: "Ice Hawks", logoUrl: "https://abc.public.blob.vercel-storage.com/branding/team/t1/l.png", brandPrimaryColor: "#9B1B30" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.teamMember.findFirst.mockResolvedValue({ id: "m", role: "ADMIN" });
    mockPrisma.practiceSession.findUnique.mockResolvedValue(DETAIL);
  });

  it("reads the team's logo and brand color into the mark", async () => {
    const result = await getPracticeSessionDetail(SESSION_ID);
    expect(result?.session.teamMark).toEqual({
      id: "t1", name: "Ice Hawks", logoUrl: "https://abc.public.blob.vercel-storage.com/branding/team/t1/l.png", color: "#9B1B30",
    });
    expect(mockPrisma.practiceSession.findUnique.mock.calls[0][0].include.team).toEqual({
      select: { id: true, name: true, logoUrl: true, brandPrimaryColor: true },
    });
  });

  it("reads a team without branding as a mark with no logo and no color", async () => {
    mockPrisma.practiceSession.findUnique.mockResolvedValueOnce({
      ...DETAIL,
      team: { id: "t1", name: "Ice Hawks", logoUrl: null, brandPrimaryColor: null },
    });
    expect((await getPracticeSessionDetail(SESSION_ID))?.session.teamMark).toEqual({ id: "t1", name: "Ice Hawks", logoUrl: null, color: null });
  });
});
