import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    event: {
      findMany: vi.fn(),
    },
    seasonGame: {
      findMany: vi.fn(),
    },
    venueScheduleBlock: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

import { findGameConflicts } from "@/lib/utils/game-conflicts";
import type { GameConflictCandidate } from "@/lib/utils/game-conflicts";

// ---------------------------------------------------------------------------
// Fixtures + in-memory where-clause evaluation
//
// The mocked findMany implementations filter fixture rows with the same
// semantics Prisma applies (lt/gt/gte are strict where written, `not: null`,
// `in`, OR arrays), so the tests exercise the real overlap and surface math
// encoded in the queries instead of just canned return values.
// ---------------------------------------------------------------------------

const VENUE = "venue-1";
const OTHER_VENUE = "venue-2";
const SURFACE_A = "surface-a";
const SURFACE_B = "surface-b";

const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 8, 12, hour, minute));

type EventRow = {
  id: string;
  venueId: string;
  title: string;
  startAt: Date;
  endAt: Date | null;
};

type SeasonGameRow = {
  id: string;
  venueId: string;
  status: "DRAFT" | "SCHEDULED" | "COMPLETED" | "CANCELED";
  startAt: Date;
  endAt: Date;
  surfaceId: string | null;
  homeTeam: { name: string };
  awayTeam: { name: string };
};

type BlockRow = {
  id: string;
  venueId: string;
  status: "DRAFT" | "PUBLISHED" | "CANCELED" | "ARCHIVED";
  title: string;
  startsAt: Date;
  endsAt: Date;
  surfaceId: string | null;
};

let eventRows: EventRow[];
let seasonGameRows: SeasonGameRow[];
let blockRows: BlockRow[];

function matchesEventCondition(row: EventRow, cond: any): boolean {
  if ("endAt" in cond) {
    if (cond.endAt === null) {
      if (row.endAt !== null) return false;
    } else if (cond.endAt.not === null) {
      if (row.endAt === null) return false;
    } else if (cond.endAt.gt !== undefined) {
      if (row.endAt === null || !(row.endAt > cond.endAt.gt)) return false;
    }
  }
  if (cond.startAt) {
    if (cond.startAt.lt !== undefined && !(row.startAt < cond.startAt.lt)) return false;
    if (cond.startAt.gte !== undefined && !(row.startAt >= cond.startAt.gte)) return false;
  }
  return true;
}

function matchesEventWhere(row: EventRow, where: any): boolean {
  if (row.venueId !== where.venueId) return false;
  if (where.id?.not !== undefined && row.id === where.id.not) return false;
  return (where.AND ?? []).every((clause: any) =>
    clause.OR.some((cond: any) => matchesEventCondition(row, cond))
  );
}

function matchesSurfaceOr(rowSurfaceId: string | null, where: any): boolean {
  if (!where.OR) return true; // venue-wide candidate: no surface filter
  return where.OR.some((cond: any) => rowSurfaceId === cond.surfaceId);
}

function matchesSeasonGameWhere(row: SeasonGameRow, where: any): boolean {
  if (row.venueId !== where.venueId) return false;
  if (where.status?.in && !where.status.in.includes(row.status)) return false;
  if (where.id?.not !== undefined && row.id === where.id.not) return false;
  if (!matchesSurfaceOr(row.surfaceId, where)) return false;
  if (!(row.startAt < where.startAt.lt)) return false;
  if (!(row.endAt > where.endAt.gt)) return false;
  return true;
}

function matchesBlockWhere(row: BlockRow, where: any): boolean {
  if (row.venueId !== where.venueId) return false;
  if (where.status !== undefined && row.status !== where.status) return false;
  if (!matchesSurfaceOr(row.surfaceId, where)) return false;
  if (!(row.startsAt < where.startsAt.lt)) return false;
  if (!(row.endsAt > where.endsAt.gt)) return false;
  return true;
}

const candidate = (overrides: Partial<GameConflictCandidate> = {}): GameConflictCandidate => ({
  venueId: VENUE,
  startAt: at(10),
  endAt: at(11),
  ...overrides,
});

const eventRow = (overrides: Partial<EventRow> = {}): EventRow => ({
  id: "event-1",
  venueId: VENUE,
  title: "Open Skate",
  startAt: at(10, 30),
  endAt: at(11, 30),
  ...overrides,
});

const gameRow = (overrides: Partial<SeasonGameRow> = {}): SeasonGameRow => ({
  id: "game-1",
  venueId: VENUE,
  status: "SCHEDULED",
  startAt: at(10, 15),
  endAt: at(11, 15),
  surfaceId: null,
  homeTeam: { name: "Hawks" },
  awayTeam: { name: "Otters" },
  ...overrides,
});

const blockRow = (overrides: Partial<BlockRow> = {}): BlockRow => ({
  id: "block-1",
  venueId: VENUE,
  status: "PUBLISHED",
  title: "Stick & Puck",
  startsAt: at(10, 45),
  endsAt: at(11, 45),
  surfaceId: null,
  ...overrides,
});

describe("findGameConflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventRows = [];
    seasonGameRows = [];
    blockRows = [];

    mockPrisma.event.findMany.mockImplementation(async ({ where }: { where: unknown }) =>
      eventRows
        .filter((row) => matchesEventWhere(row, where))
        .map(({ title, startAt, endAt }) => ({ title, startAt, endAt }))
    );
    mockPrisma.seasonGame.findMany.mockImplementation(async ({ where }: { where: unknown }) =>
      seasonGameRows
        .filter((row) => matchesSeasonGameWhere(row, where))
        .map(({ startAt, endAt, surfaceId, homeTeam, awayTeam }) => ({
          startAt,
          endAt,
          surfaceId,
          homeTeam,
          awayTeam,
        }))
    );
    mockPrisma.venueScheduleBlock.findMany.mockImplementation(
      async ({ where }: { where: unknown }) =>
        blockRows
          .filter((row) => matchesBlockWhere(row, where))
          .map(({ title, startsAt, endsAt, surfaceId }) => ({
            title,
            startsAt,
            endsAt,
            surfaceId,
          }))
    );
  });

  it("returns overlapping bookings from all three sources, labeled and sorted by startAt", async () => {
    eventRows = [eventRow({ startAt: at(10, 30), endAt: at(11, 30) })];
    seasonGameRows = [gameRow({ startAt: at(9, 30), endAt: at(10, 30), surfaceId: SURFACE_A })];
    blockRows = [blockRow({ startsAt: at(10, 15), endsAt: at(10, 45) })];

    const conflicts = await findGameConflicts(candidate());

    expect(conflicts).toEqual([
      {
        source: "seasonGame",
        title: "Hawks vs Otters",
        startAt: at(9, 30),
        endAt: at(10, 30),
        surfaceId: SURFACE_A,
      },
      {
        source: "scheduleBlock",
        title: "Stick & Puck",
        startAt: at(10, 15),
        endAt: at(10, 45),
        surfaceId: null,
      },
      {
        source: "event",
        title: "Open Skate",
        startAt: at(10, 30),
        endAt: at(11, 30),
        surfaceId: null,
      },
    ]);
  });

  it("does not report touching intervals as conflicts", async () => {
    // Existing bookings that end exactly at the candidate start or start
    // exactly at the candidate end (candidate: 10:00-11:00).
    eventRows = [
      eventRow({ id: "event-before", startAt: at(9), endAt: at(10) }),
      eventRow({ id: "event-after", startAt: at(11), endAt: at(12) }),
    ];
    seasonGameRows = [
      gameRow({ id: "game-before", startAt: at(9), endAt: at(10) }),
      gameRow({ id: "game-after", startAt: at(11), endAt: at(12) }),
    ];
    blockRows = [
      blockRow({ id: "block-before", startsAt: at(9), endsAt: at(10) }),
      blockRow({ id: "block-after", startsAt: at(11), endsAt: at(12) }),
    ];

    await expect(findGameConflicts(candidate())).resolves.toEqual([]);
  });

  it("treats events without an endAt as point-in-time within the candidate range", async () => {
    eventRows = [
      // Starts exactly at candidate start: conflicts.
      eventRow({ id: "event-at-start", startAt: at(10), endAt: null }),
      // Starts exactly at candidate end: no conflict.
      eventRow({ id: "event-at-end", startAt: at(11), endAt: null }),
      // Starts before candidate start: no conflict (point-in-time already passed).
      eventRow({ id: "event-earlier", startAt: at(9, 45), endAt: null }),
    ];

    const conflicts = await findGameConflicts(candidate());

    expect(conflicts).toEqual([
      {
        source: "event",
        title: "Open Skate",
        startAt: at(10),
        endAt: null,
        surfaceId: null,
      },
    ]);
  });

  it("does not conflict with bookings on a different surface of the same venue", async () => {
    seasonGameRows = [
      gameRow({ id: "game-other-surface", surfaceId: SURFACE_B }),
      gameRow({
        id: "game-same-surface",
        surfaceId: SURFACE_A,
        homeTeam: { name: "Bears" },
        awayTeam: { name: "Wolves" },
      }),
    ];
    blockRows = [
      blockRow({ id: "block-other-surface", surfaceId: SURFACE_B }),
      blockRow({ id: "block-venue-wide", surfaceId: null }),
    ];

    const conflicts = await findGameConflicts(candidate({ surfaceId: SURFACE_A }));

    expect(conflicts).toHaveLength(2);
    expect(conflicts.map((c) => [c.source, c.surfaceId])).toEqual([
      ["seasonGame", SURFACE_A],
      ["scheduleBlock", null],
    ]);
  });

  it("treats a candidate without a surface as venue-wide, conflicting with any surface", async () => {
    seasonGameRows = [gameRow({ surfaceId: SURFACE_B })];
    blockRows = [blockRow({ surfaceId: SURFACE_A })];

    const conflicts = await findGameConflicts(candidate({ surfaceId: null }));

    expect(conflicts.map((c) => c.source).sort()).toEqual(["scheduleBlock", "seasonGame"].sort());
  });

  it("treats calendar events as venue-wide even when the candidate targets a surface", async () => {
    eventRows = [eventRow()];

    const conflicts = await findGameConflicts(candidate({ surfaceId: SURFACE_A }));

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ source: "event", surfaceId: null });
  });

  it("excludes DRAFT and CANCELED season games", async () => {
    seasonGameRows = [
      gameRow({ id: "game-draft", status: "DRAFT" }),
      gameRow({ id: "game-canceled", status: "CANCELED" }),
      gameRow({ id: "game-completed", status: "COMPLETED" }),
      gameRow({ id: "game-scheduled", status: "SCHEDULED" }),
    ];

    const conflicts = await findGameConflicts(candidate());

    expect(conflicts).toHaveLength(2);
    expect(conflicts.every((c) => c.source === "seasonGame")).toBe(true);
  });

  it("excludes schedule blocks that are not PUBLISHED", async () => {
    blockRows = [
      blockRow({ id: "block-draft", status: "DRAFT" }),
      blockRow({ id: "block-canceled", status: "CANCELED" }),
      blockRow({ id: "block-archived", status: "ARCHIVED" }),
      blockRow({ id: "block-published", status: "PUBLISHED" }),
    ];

    const conflicts = await findGameConflicts(candidate());

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].source).toBe("scheduleBlock");
  });

  it("respects excludeSeasonGameId and excludeEventId", async () => {
    eventRows = [
      eventRow({ id: "event-self" }),
      eventRow({ id: "event-other", title: "Public Session" }),
    ];
    seasonGameRows = [
      gameRow({ id: "game-self" }),
      gameRow({ id: "game-other", homeTeam: { name: "Bears" }, awayTeam: { name: "Wolves" } }),
    ];

    const conflicts = await findGameConflicts(
      candidate({ excludeSeasonGameId: "game-self", excludeEventId: "event-self" })
    );

    expect(conflicts.map((c) => c.title).sort()).toEqual(["Bears vs Wolves", "Public Session"]);
  });

  it("ignores bookings at other venues", async () => {
    eventRows = [eventRow({ venueId: OTHER_VENUE })];
    seasonGameRows = [gameRow({ venueId: OTHER_VENUE })];
    blockRows = [blockRow({ venueId: OTHER_VENUE })];

    await expect(findGameConflicts(candidate())).resolves.toEqual([]);
  });

  it("sorts merged results across sources by startAt ascending", async () => {
    eventRows = [eventRow({ startAt: at(10, 50), endAt: at(11, 50) })];
    seasonGameRows = [gameRow({ startAt: at(10, 10), endAt: at(10, 40) })];
    blockRows = [blockRow({ startsAt: at(10, 30), endsAt: at(11) })];

    const conflicts = await findGameConflicts(candidate());

    expect(conflicts.map((c) => [c.source, c.startAt.toISOString()])).toEqual([
      ["seasonGame", at(10, 10).toISOString()],
      ["scheduleBlock", at(10, 30).toISOString()],
      ["event", at(10, 50).toISOString()],
    ]);
  });
});
