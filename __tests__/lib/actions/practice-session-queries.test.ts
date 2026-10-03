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
