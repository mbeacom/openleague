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

import { getPracticeSessionForEdit } from "@/lib/actions/practice-session-queries";

function row(id: string, sequence: number) {
  return {
    id,
    sequence,
    duration: 10,
    instructions: null,
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
});
