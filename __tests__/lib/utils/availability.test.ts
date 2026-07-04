import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    event: {
      findMany: vi.fn(),
    },
    seasonGame: {
      findMany: vi.fn(),
    },
    eventGame: {
      findMany: vi.fn(),
    },
    venueScheduleBlock: {
      findMany: vi.fn(),
    },
    practiceSession: {
      findMany: vi.fn(),
    },
    segmentCoexistence: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

import { findBookingConflicts, getVenueBookings } from "@/lib/utils/availability";
import type { AvailabilityCandidate } from "@/lib/utils/availability";

// ---------------------------------------------------------------------------
// Fixtures + in-memory where-clause evaluation
//
// Following the game-conflicts.test.ts pattern: the mocked findMany
// implementations filter fixture rows with the same semantics Prisma applies
// (strict lt/gt, gte, `not`, `in`, nested relation filters, OR/AND arrays),
// so the tests exercise the real overlap pre-filters in the queries plus the
// segment/coexistence math that runs in JS.
//
// SC-004 fixture: one venue with surface-1 segmented as A (HALF_A) and
// B (HALF_B) which coexist, plus C (CROSS zone inside A's half) which
// conflicts with A (no coexistence row) but coexists with B. surface-2 has
// no segments.
// ---------------------------------------------------------------------------

const VENUE = "venue-1";
const OTHER_VENUE = "venue-2";
const SURFACE_1 = "surface-1";
const SURFACE_2 = "surface-2";
const SEG_A = "seg-a";
const SEG_B = "seg-b";
const SEG_C = "seg-c";

const SEGMENT_NAMES: Record<string, string> = {
  [SEG_A]: "North half",
  [SEG_B]: "South half",
  [SEG_C]: "Cross-ice 1",
};

const SEGMENT_SURFACE: Record<string, string> = {
  [SEG_A]: SURFACE_1,
  [SEG_B]: SURFACE_1,
  [SEG_C]: SURFACE_1,
};

/** segmentId + segment relation shaped like the Prisma select. */
const seg = (segmentId: string | null) =>
  segmentId
    ? { segmentId, segment: { name: SEGMENT_NAMES[segmentId] } }
    : { segmentId: null, segment: null };

const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 8, 12, hour, minute));
const utc = (y: number, m: number, d: number, hour = 0, minute = 0) =>
  new Date(Date.UTC(y, m, d, hour, minute));

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
  segmentId: string | null;
  segment: { name: string } | null;
  homeTeam: { name: string };
  awayTeam: { name: string };
};

type EventGameRow = {
  id: string;
  name: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELED";
  startAt: Date;
  endAt: Date;
  surfaceId: string | null;
  segmentId: string | null;
  segment: { name: string } | null;
  event: {
    venueId: string | null;
    status: "DRAFT" | "PUBLISHED" | "CANCELED" | "COMPLETED";
    title: string;
  };
};

type BlockRow = {
  id: string;
  venueId: string;
  status: "DRAFT" | "PUBLISHED" | "CANCELED" | "ARCHIVED";
  title: string;
  startsAt: Date;
  endsAt: Date;
  surfaceId: string | null;
  segmentId: string | null;
  segment: { name: string } | null;
  recurrenceRule: string | null;
  recurrenceEndDate: Date | null;
};

type PracticeRow = {
  id: string;
  venueId: string | null;
  title: string;
  startAt: Date | null;
  duration: number;
  surfaceId: string | null;
  segmentId: string | null;
  segment: { name: string } | null;
};

type CoexistenceRow = { segmentAId: string; segmentBId: string };

let eventRows: EventRow[];
let seasonGameRows: SeasonGameRow[];
let eventGameRows: EventGameRow[];
let blockRows: BlockRow[];
let practiceRows: PracticeRow[];
let coexistenceRows: CoexistenceRow[];

function matchesSurfaceOr(rowSurfaceId: string | null, where: any): boolean {
  if (!where.OR) return true; // venue-wide candidate: no surface pre-filter
  return where.OR.some((cond: any) => rowSurfaceId === cond.surfaceId);
}

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

function matchesSeasonGameWhere(row: SeasonGameRow, where: any): boolean {
  if (row.venueId !== where.venueId) return false;
  if (where.status?.in && !where.status.in.includes(row.status)) return false;
  if (where.id?.not !== undefined && row.id === where.id.not) return false;
  if (!matchesSurfaceOr(row.surfaceId, where)) return false;
  if (!(row.startAt < where.startAt.lt)) return false;
  if (!(row.endAt > where.endAt.gt)) return false;
  return true;
}

function matchesEventGameWhere(row: EventGameRow, where: any): boolean {
  if (row.event.venueId !== where.event.venueId) return false;
  if (row.event.status !== where.event.status) return false;
  if (where.status?.not !== undefined && row.status === where.status.not) return false;
  if (where.id?.not !== undefined && row.id === where.id.not) return false;
  if (!matchesSurfaceOr(row.surfaceId, where)) return false;
  if (!(row.startAt < where.startAt.lt)) return false;
  if (!(row.endAt > where.endAt.gt)) return false;
  return true;
}

function matchesBlockWhere(row: BlockRow, where: any): boolean {
  if (row.venueId !== where.venueId) return false;
  if (row.status !== where.status) return false;
  if (where.id?.not !== undefined && row.id === where.id.not) return false;
  if (!matchesSurfaceOr(row.surfaceId, where)) return false;
  if (!(row.startsAt < where.startsAt.lt)) return false;
  return (where.AND ?? []).every((clause: any) =>
    clause.OR.some((cond: any) =>
      cond.recurrenceRule === null
        ? row.recurrenceRule === null && row.endsAt > cond.endsAt.gt
        : row.recurrenceRule !== null
    )
  );
}

function matchesPracticeWhere(row: PracticeRow, where: any): boolean {
  if (row.venueId !== where.venueId) return false;
  if (where.id?.not !== undefined && row.id === where.id.not) return false;
  if (!matchesSurfaceOr(row.surfaceId, where)) return false;
  if (row.startAt === null) return false; // startAt: { not: null }
  if (!(row.startAt < where.startAt.lt)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Row builders. Defaults overlap the default candidate window (10:00-11:00).
// ---------------------------------------------------------------------------

const candidate = (overrides: Partial<AvailabilityCandidate> = {}): AvailabilityCandidate => ({
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
  surfaceId: SURFACE_1,
  ...seg(null),
  homeTeam: { name: "Hawks" },
  awayTeam: { name: "Otters" },
  ...overrides,
});

const eventGameRow = (overrides: Partial<EventGameRow> = {}): EventGameRow => ({
  id: "egame-1",
  name: null,
  status: "SCHEDULED",
  startAt: at(10, 15),
  endAt: at(11, 15),
  surfaceId: SURFACE_1,
  ...seg(null),
  event: { venueId: VENUE, status: "PUBLISHED", title: "Summer Classic" },
  ...overrides,
});

const blockRow = (overrides: Partial<BlockRow> = {}): BlockRow => ({
  id: "block-1",
  venueId: VENUE,
  status: "PUBLISHED",
  title: "Stick & Puck",
  startsAt: at(10, 45),
  endsAt: at(11, 45),
  surfaceId: SURFACE_1,
  ...seg(null),
  recurrenceRule: null,
  recurrenceEndDate: null,
  ...overrides,
});

const practiceRow = (overrides: Partial<PracticeRow> = {}): PracticeRow => ({
  id: "practice-1",
  venueId: VENUE,
  title: "Morning Skate",
  startAt: at(10, 30),
  duration: 60,
  surfaceId: SURFACE_1,
  ...seg(null),
  ...overrides,
});

/** One overlapping row per segment-capable source on the given scope. */
function seedSegmentSources(segmentId: string | null, surfaceId: string | null = SURFACE_1) {
  seasonGameRows = [gameRow({ surfaceId, ...seg(segmentId) })];
  eventGameRows = [eventGameRow({ surfaceId, ...seg(segmentId) })];
  blockRows = [blockRow({ surfaceId, ...seg(segmentId) })];
  practiceRows = [practiceRow({ surfaceId, ...seg(segmentId) })];
}

describe("availability engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventRows = [];
    seasonGameRows = [];
    eventGameRows = [];
    blockRows = [];
    practiceRows = [];
    // A<->B and B<->C coexist; A<->C has no row and therefore conflicts.
    coexistenceRows = [
      { segmentAId: SEG_A, segmentBId: SEG_B },
      { segmentAId: SEG_B, segmentBId: SEG_C },
    ];

    mockPrisma.event.findMany.mockImplementation(async ({ where }: { where: unknown }) =>
      eventRows.filter((row) => matchesEventWhere(row, where))
    );
    mockPrisma.seasonGame.findMany.mockImplementation(async ({ where }: { where: unknown }) =>
      seasonGameRows.filter((row) => matchesSeasonGameWhere(row, where))
    );
    mockPrisma.eventGame.findMany.mockImplementation(async ({ where }: { where: unknown }) =>
      eventGameRows.filter((row) => matchesEventGameWhere(row, where))
    );
    mockPrisma.venueScheduleBlock.findMany.mockImplementation(
      async ({ where }: { where: unknown }) =>
        blockRows.filter((row) => matchesBlockWhere(row, where))
    );
    mockPrisma.practiceSession.findMany.mockImplementation(
      async ({ where }: { where: unknown }) =>
        practiceRows.filter((row) => matchesPracticeWhere(row, where))
    );
    mockPrisma.segmentCoexistence.findMany.mockImplementation(
      async ({ where }: { where: any }) =>
        coexistenceRows.filter(
          (row) => SEGMENT_SURFACE[row.segmentAId] === where.segmentA.surfaceId
        )
    );
  });

  describe("findBookingConflicts — SC-004 segment matrix", () => {
    it("does not conflict when the candidate is on a segment that coexists with the booked one (all segment-capable sources)", async () => {
      // Calendar Events cannot sit on a segment (always venue-wide); the
      // other four sources are seeded on A while the candidate takes B.
      seedSegmentSources(SEG_A);

      await expect(
        findBookingConflicts(candidate({ surfaceId: SURFACE_1, segmentId: SEG_B }))
      ).resolves.toEqual([]);
    });

    it("conflicts when the candidate takes the whole surface over segment bookings from every source", async () => {
      seedSegmentSources(SEG_A);
      eventRows = [eventRow()];

      const conflicts = await findBookingConflicts(
        candidate({ surfaceId: SURFACE_1, segmentId: null })
      );

      expect(conflicts.map((c) => c.source).sort()).toEqual([
        "event",
        "eventGame",
        "practice",
        "scheduleBlock",
        "seasonGame",
      ]);
      const game = conflicts.find((c) => c.source === "seasonGame");
      expect(game).toMatchObject({
        title: "Hawks vs Otters",
        surfaceId: SURFACE_1,
        segmentId: SEG_A,
        segmentName: "North half",
      });
      const eventGame = conflicts.find((c) => c.source === "eventGame");
      expect(eventGame).toMatchObject({ title: "Game — Summer Classic" });
      const practice = conflicts.find((c) => c.source === "practice");
      expect(practice).toMatchObject({
        title: "Practice — Morning Skate",
        startAt: at(10, 30),
        endAt: at(11, 30), // startAt + 60 minutes
      });
    });

    it("conflicts between segments with no declared coexistence (C over A)", async () => {
      seedSegmentSources(SEG_A);

      const conflicts = await findBookingConflicts(
        candidate({ surfaceId: SURFACE_1, segmentId: SEG_C })
      );

      expect(conflicts.map((c) => c.source).sort()).toEqual([
        "eventGame",
        "practice",
        "scheduleBlock",
        "seasonGame",
      ]);
    });

    it("does not conflict between segments with declared coexistence (C over B)", async () => {
      seedSegmentSources(SEG_B);

      await expect(
        findBookingConflicts(candidate({ surfaceId: SURFACE_1, segmentId: SEG_C }))
      ).resolves.toEqual([]);
    });

    it("always conflicts when the same segment is booked twice", async () => {
      seedSegmentSources(SEG_B);

      const conflicts = await findBookingConflicts(
        candidate({ surfaceId: SURFACE_1, segmentId: SEG_B })
      );

      expect(conflicts).toHaveLength(4);
    });

    it("conflicts with whole-surface bookings from a segment candidate", async () => {
      seedSegmentSources(null); // existing rows hold the whole surface

      const conflicts = await findBookingConflicts(
        candidate({ surfaceId: SURFACE_1, segmentId: SEG_B })
      );

      expect(conflicts).toHaveLength(4);
      expect(conflicts.every((c) => c.segmentId === null)).toBe(true);
    });

    it("treats calendar events as venue-wide, conflicting with any segment candidate", async () => {
      eventRows = [eventRow()];

      const conflicts = await findBookingConflicts(
        candidate({ surfaceId: SURFACE_1, segmentId: SEG_B })
      );

      expect(conflicts).toEqual([
        {
          source: "event",
          title: "Open Skate",
          startAt: at(10, 30),
          endAt: at(11, 30),
          surfaceId: null,
          segmentId: null,
          segmentName: null,
        },
      ]);
    });

    it("treats rows without a surface as venue-wide, conflicting with any segment candidate", async () => {
      blockRows = [blockRow({ surfaceId: null })];
      practiceRows = [practiceRow({ surfaceId: null })];

      const conflicts = await findBookingConflicts(
        candidate({ surfaceId: SURFACE_1, segmentId: SEG_B })
      );

      expect(conflicts.map((c) => c.source).sort()).toEqual(["practice", "scheduleBlock"]);
    });

    it("never conflicts across different surfaces of the same venue", async () => {
      seedSegmentSources(null, SURFACE_2);

      await expect(
        findBookingConflicts(candidate({ surfaceId: SURFACE_1, segmentId: SEG_B }))
      ).resolves.toEqual([]);
      await expect(
        findBookingConflicts(candidate({ surfaceId: SURFACE_1, segmentId: null }))
      ).resolves.toEqual([]);
    });

    it("treats a candidate without a surface as venue-wide, conflicting with segment bookings everywhere", async () => {
      seedSegmentSources(SEG_A);

      const conflicts = await findBookingConflicts(candidate());

      expect(conflicts).toHaveLength(4);
    });

    it("ignores bookings at other venues", async () => {
      eventRows = [eventRow({ venueId: OTHER_VENUE })];
      seasonGameRows = [gameRow({ venueId: OTHER_VENUE })];
      eventGameRows = [
        eventGameRow({ event: { venueId: OTHER_VENUE, status: "PUBLISHED", title: "Away" } }),
      ];
      blockRows = [blockRow({ venueId: OTHER_VENUE })];
      practiceRows = [practiceRow({ venueId: OTHER_VENUE })];

      await expect(findBookingConflicts(candidate())).resolves.toEqual([]);
    });
  });

  describe("findBookingConflicts — time semantics", () => {
    it("never reports touching intervals from any source (candidate 10:00-11:00)", async () => {
      eventRows = [
        eventRow({ id: "event-before", startAt: at(9), endAt: at(10) }),
        eventRow({ id: "event-after", startAt: at(11), endAt: at(12) }),
      ];
      seasonGameRows = [
        gameRow({ id: "game-before", startAt: at(9), endAt: at(10) }),
        gameRow({ id: "game-after", startAt: at(11), endAt: at(12) }),
      ];
      eventGameRows = [
        eventGameRow({ id: "egame-before", startAt: at(9), endAt: at(10) }),
        eventGameRow({ id: "egame-after", startAt: at(11), endAt: at(12) }),
      ];
      blockRows = [
        blockRow({ id: "block-before", startsAt: at(9), endsAt: at(10) }),
        blockRow({ id: "block-after", startsAt: at(11), endsAt: at(12) }),
      ];
      practiceRows = [
        practiceRow({ id: "practice-before", startAt: at(9), duration: 60 }), // ends 10:00
        practiceRow({ id: "practice-after", startAt: at(11), duration: 60 }),
      ];

      await expect(findBookingConflicts(candidate())).resolves.toEqual([]);
    });

    it("treats events without an endAt as point-in-time within the candidate range", async () => {
      eventRows = [
        // Starts exactly at candidate start: conflicts.
        eventRow({ id: "event-at-start", startAt: at(10), endAt: null }),
        // Starts exactly at candidate end: no conflict.
        eventRow({ id: "event-at-end", startAt: at(11), endAt: null }),
        // Starts before candidate start: no conflict (moment already passed).
        eventRow({ id: "event-earlier", startAt: at(9, 45), endAt: null }),
      ];

      const conflicts = await findBookingConflicts(candidate());

      expect(conflicts).toEqual([
        {
          source: "event",
          title: "Open Skate",
          startAt: at(10),
          endAt: null,
          surfaceId: null,
          segmentId: null,
          segmentName: null,
        },
      ]);
    });

    it("sorts merged results across sources by startAt ascending", async () => {
      eventRows = [eventRow({ startAt: at(10, 50), endAt: at(11, 50) })];
      seasonGameRows = [gameRow({ startAt: at(10, 10), endAt: at(10, 40) })];
      eventGameRows = [eventGameRow({ startAt: at(10, 40), endAt: at(11, 40) })];
      blockRows = [blockRow({ startsAt: at(10, 30), endsAt: at(11) })];
      practiceRows = [practiceRow({ startAt: at(10, 20), duration: 30 })];

      const conflicts = await findBookingConflicts(candidate());

      expect(conflicts.map((c) => [c.source, c.startAt.toISOString()])).toEqual([
        ["seasonGame", at(10, 10).toISOString()],
        ["practice", at(10, 20).toISOString()],
        ["scheduleBlock", at(10, 30).toISOString()],
        ["eventGame", at(10, 40).toISOString()],
        ["event", at(10, 50).toISOString()],
      ]);
    });
  });

  describe("findBookingConflicts — source inclusion filters", () => {
    it("excludes DRAFT and CANCELED season games", async () => {
      seasonGameRows = [
        gameRow({ id: "game-draft", status: "DRAFT" }),
        gameRow({ id: "game-canceled", status: "CANCELED" }),
        gameRow({ id: "game-completed", status: "COMPLETED" }),
        gameRow({ id: "game-scheduled", status: "SCHEDULED" }),
      ];

      const conflicts = await findBookingConflicts(candidate());

      expect(conflicts).toHaveLength(2);
      expect(conflicts.every((c) => c.source === "seasonGame")).toBe(true);
    });

    it("excludes CANCELED event games and games on unpublished parent events", async () => {
      eventGameRows = [
        eventGameRow({ id: "egame-canceled", status: "CANCELED" }),
        eventGameRow({
          id: "egame-draft-parent",
          event: { venueId: VENUE, status: "DRAFT", title: "Draft Tourney" },
        }),
        eventGameRow({
          id: "egame-canceled-parent",
          event: { venueId: VENUE, status: "CANCELED", title: "Canceled Tourney" },
        }),
        eventGameRow({ id: "egame-live", name: "Semifinal 1" }),
      ];

      const conflicts = await findBookingConflicts(candidate());

      expect(conflicts).toEqual([
        {
          source: "eventGame",
          title: "Semifinal 1 — Summer Classic",
          startAt: at(10, 15),
          endAt: at(11, 15),
          surfaceId: SURFACE_1,
          segmentId: null,
          segmentName: null,
        },
      ]);
    });

    it("excludes schedule blocks that are not PUBLISHED", async () => {
      blockRows = [
        blockRow({ id: "block-draft", status: "DRAFT" }),
        blockRow({ id: "block-canceled", status: "CANCELED" }),
        blockRow({ id: "block-archived", status: "ARCHIVED" }),
        blockRow({ id: "block-published", status: "PUBLISHED" }),
      ];

      const conflicts = await findBookingConflicts(candidate());

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].source).toBe("scheduleBlock");
    });

    it("excludes practices without a venue or without a start time", async () => {
      practiceRows = [
        practiceRow({ id: "practice-unattached", venueId: null }),
        practiceRow({ id: "practice-no-start", startAt: null }),
        practiceRow({ id: "practice-attached" }),
      ];

      const conflicts = await findBookingConflicts(candidate());

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toMatchObject({
        source: "practice",
        title: "Practice — Morning Skate",
      });
    });
  });

  describe("findBookingConflicts — exclusions", () => {
    beforeEach(() => {
      eventRows = [eventRow()];
      seasonGameRows = [gameRow()];
      eventGameRows = [eventGameRow()];
      blockRows = [blockRow()];
      practiceRows = [practiceRow()];
    });

    it.each([
      ["excludeEventId", "event-1", "event"],
      ["excludeSeasonGameId", "game-1", "seasonGame"],
      ["excludeEventGameId", "egame-1", "eventGame"],
      ["excludeBlockId", "block-1", "scheduleBlock"],
      ["excludePracticeId", "practice-1", "practice"],
    ] as const)("%s removes only its own source's row", async (field, id, source) => {
      const conflicts = await findBookingConflicts(candidate({ [field]: id }));

      expect(conflicts).toHaveLength(4);
      expect(conflicts.some((c) => c.source === source)).toBe(false);
    });

    it("supports all exclusions at once", async () => {
      await expect(
        findBookingConflicts(
          candidate({
            excludeEventId: "event-1",
            excludeSeasonGameId: "game-1",
            excludeEventGameId: "egame-1",
            excludeBlockId: "block-1",
            excludePracticeId: "practice-1",
          })
        )
      ).resolves.toEqual([]);
    });

    it("does not exclude rows with different ids", async () => {
      const conflicts = await findBookingConflicts(
        candidate({
          excludeEventId: "event-other",
          excludeSeasonGameId: "game-other",
          excludeEventGameId: "egame-other",
          excludeBlockId: "block-other",
          excludePracticeId: "practice-other",
        })
      );

      expect(conflicts).toHaveLength(5);
    });
  });

  describe("findBookingConflicts — recurring blocks", () => {
    // Weekly block anchored Mon 2026-09-07 10:00-11:00 UTC.
    const seedWeeklyBlock = (overrides: Partial<BlockRow> = {}) => {
      blockRows = [
        blockRow({
          startsAt: utc(2026, 8, 7, 10),
          endsAt: utc(2026, 8, 7, 11),
          recurrenceRule: "FREQ=WEEKLY",
          ...overrides,
        }),
      ];
    };

    it("reports occurrence times for occurrences inside the candidate window", async () => {
      seedWeeklyBlock();

      const conflicts = await findBookingConflicts(
        candidate({ startAt: utc(2026, 8, 14, 10, 30), endAt: utc(2026, 8, 14, 11, 30) })
      );

      expect(conflicts).toEqual([
        {
          source: "scheduleBlock",
          title: "Stick & Puck",
          startAt: utc(2026, 8, 14, 10),
          endAt: utc(2026, 8, 14, 11),
          surfaceId: SURFACE_1,
          segmentId: null,
          segmentName: null,
        },
      ]);
    });

    it("produces no conflict when the window falls between occurrences", async () => {
      seedWeeklyBlock();

      await expect(
        findBookingConflicts(
          candidate({ startAt: utc(2026, 8, 15, 10), endAt: utc(2026, 8, 15, 11) })
        )
      ).resolves.toEqual([]);
    });

    it("stops expanding past recurrenceEndDate", async () => {
      seedWeeklyBlock({ recurrenceEndDate: utc(2026, 8, 10) });

      await expect(
        findBookingConflicts(
          candidate({ startAt: utc(2026, 8, 14, 10), endAt: utc(2026, 8, 14, 11) })
        )
      ).resolves.toEqual([]);
    });

    it("applies segment coexistence math per occurrence", async () => {
      seedWeeklyBlock({ ...seg(SEG_A) });

      // B coexists with A: the overlapping occurrence is not a conflict.
      await expect(
        findBookingConflicts(
          candidate({
            surfaceId: SURFACE_1,
            segmentId: SEG_B,
            startAt: utc(2026, 8, 14, 10),
            endAt: utc(2026, 8, 14, 11),
          })
        )
      ).resolves.toEqual([]);

      // C conflicts with A: the same occurrence is reported.
      const conflicts = await findBookingConflicts(
        candidate({
          surfaceId: SURFACE_1,
          segmentId: SEG_C,
          startAt: utc(2026, 8, 14, 10),
          endAt: utc(2026, 8, 14, 11),
        })
      );

      expect(conflicts).toEqual([
        expect.objectContaining({
          source: "scheduleBlock",
          startAt: utc(2026, 8, 14, 10),
          segmentId: SEG_A,
          segmentName: "North half",
        }),
      ]);
    });
  });

  describe("getVenueBookings", () => {
    it("returns rows from all five sources with ids, filtered and sorted by startAt", async () => {
      eventRows = [eventRow({ startAt: at(9), endAt: at(9, 45) })];
      seasonGameRows = [
        gameRow({ startAt: at(9, 30), endAt: at(10, 30), ...seg(SEG_A) }),
        gameRow({ id: "game-draft", status: "DRAFT", startAt: at(9, 30), endAt: at(10, 30) }),
      ];
      eventGameRows = [
        eventGameRow({ startAt: at(10), endAt: at(11) }),
        eventGameRow({ id: "egame-canceled", status: "CANCELED", startAt: at(10), endAt: at(11) }),
      ];
      blockRows = [
        blockRow({ startsAt: at(10, 45), endsAt: at(11, 45) }),
        blockRow({ id: "block-draft", status: "DRAFT", startsAt: at(10, 45), endsAt: at(11, 45) }),
      ];
      practiceRows = [
        practiceRow({ startAt: at(11, 15), duration: 45, ...seg(SEG_B) }),
        practiceRow({ id: "practice-unattached", venueId: null, startAt: at(11, 15) }),
      ];

      const bookings = await getVenueBookings({ venueId: VENUE, from: at(8), to: at(13) });

      expect(bookings.map((b) => [b.id, b.source])).toEqual([
        ["event-1", "event"],
        ["game-1", "seasonGame"],
        ["egame-1", "eventGame"],
        ["block-1", "scheduleBlock"],
        ["practice-1", "practice"],
      ]);
      expect(bookings[1]).toEqual({
        id: "game-1",
        source: "seasonGame",
        title: "Hawks vs Otters",
        startAt: at(9, 30),
        endAt: at(10, 30),
        surfaceId: SURFACE_1,
        segmentId: SEG_A,
        segmentName: "North half",
      });
      expect(bookings[4]).toMatchObject({
        title: "Practice — Morning Skate",
        endAt: at(12), // 11:15 + 45 minutes
        segmentId: SEG_B,
        segmentName: "South half",
      });
    });

    it("expands recurring blocks into one row per occurrence in the window", async () => {
      blockRows = [
        blockRow({
          startsAt: utc(2026, 8, 7, 10),
          endsAt: utc(2026, 8, 7, 11),
          recurrenceRule: "FREQ=WEEKLY",
        }),
      ];

      const bookings = await getVenueBookings({
        venueId: VENUE,
        from: utc(2026, 8, 6),
        to: utc(2026, 8, 20),
      });

      expect(bookings.map((b) => [b.id, b.startAt.toISOString(), b.endAt?.toISOString()])).toEqual([
        ["block-1", utc(2026, 8, 7, 10).toISOString(), utc(2026, 8, 7, 11).toISOString()],
        ["block-1", utc(2026, 8, 14, 10).toISOString(), utc(2026, 8, 14, 11).toISOString()],
      ]);
    });
  });

  describe("performance (SC-008)", () => {
    it("keeps p95 latency under 500ms across 50 runs against 1,000 bookings", async () => {
      // 1,000 bookings at one venue over one month: 200 per source, spread
      // across days/hours/surfaces/segments, including 20 recurring blocks.
      const hour = 3_600_000;
      const monthStart = Date.UTC(2026, 8, 1, 6);
      const segCycle: (string | null)[] = [SEG_A, SEG_B, SEG_C, null];

      for (let i = 0; i < 200; i++) {
        const startAt = new Date(monthStart + (i % 30) * 24 * hour + (i % 12) * hour);
        const endAt = new Date(startAt.getTime() + hour);
        const surfaceId = i % 2 === 0 ? SURFACE_1 : SURFACE_2;
        const segmentId = surfaceId === SURFACE_1 ? segCycle[i % 4] : null;

        eventRows.push(eventRow({ id: `perf-event-${i}`, startAt, endAt }));
        seasonGameRows.push(
          gameRow({ id: `perf-game-${i}`, startAt, endAt, surfaceId, ...seg(segmentId) })
        );
        eventGameRows.push(
          eventGameRow({ id: `perf-egame-${i}`, startAt, endAt, surfaceId, ...seg(segmentId) })
        );
        practiceRows.push(
          practiceRow({
            id: `perf-practice-${i}`,
            startAt,
            duration: 60,
            surfaceId,
            ...seg(segmentId),
          })
        );
        blockRows.push(
          i < 20
            ? blockRow({
                id: `perf-block-${i}`,
                startsAt: new Date(monthStart + (i % 7) * 24 * hour + (i % 10) * hour),
                endsAt: new Date(monthStart + (i % 7) * 24 * hour + (i % 10 + 1) * hour),
                recurrenceRule: "FREQ=WEEKLY",
                surfaceId,
                ...seg(segmentId),
              })
            : blockRow({
                id: `perf-block-${i}`,
                startsAt: startAt,
                endsAt: endAt,
                surfaceId,
                ...seg(segmentId),
              })
        );
      }

      // SEG_C conflicts with A/C rows (and whole-surface/venue-wide rows)
      // while coexisting with B, so the run exercises the full segment math.
      const perfCandidate = candidate({
        surfaceId: SURFACE_1,
        segmentId: SEG_C,
        startAt: utc(2026, 8, 15, 6),
        endAt: utc(2026, 8, 15, 18),
      });

      const durations: number[] = [];
      let lastResult: Awaited<ReturnType<typeof findBookingConflicts>> = [];
      for (let run = 0; run < 50; run++) {
        const started = performance.now();
        lastResult = await findBookingConflicts(perfCandidate);
        durations.push(performance.now() - started);
      }

      // The fixture must actually produce work: conflicts exist in the window.
      expect(lastResult.length).toBeGreaterThan(0);

      durations.sort((a, b) => a - b);
      const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
      expect(p95).toBeLessThanOrEqual(500);
    });
  });
});
