import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  findVenueReservationAvailability,
  findVenueReservationConflicts,
} from "@/lib/services/venue-reservation-availability";

const baseCandidate = {
  venueId: "cvenue00000000000000000001",
  surfaceId: "csurface000000000000000001",
  segmentId: "csegment000000000000000001",
  startsAt: new Date("2026-09-01T18:00:00.000Z"),
  endsAt: new Date("2026-09-01T19:00:00.000Z"),
  now: new Date("2026-08-17T12:00:00.000Z"),
};

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    id: "creservation00000000000001",
    status: "CONFIRMED",
    startsAt: new Date("2026-09-01T18:30:00.000Z"),
    endsAt: new Date("2026-09-01T19:30:00.000Z"),
    timezone: "America/New_York",
    venueId: baseCandidate.venueId,
    surfaceId: baseCandidate.surfaceId,
    segmentId: baseCandidate.segmentId,
    ownerLeagueId: "cleague0000000000000000001",
    ownerTeamId: null,
    ownerVenueOrganizationId: null,
    sourceRequestId: "crequest000000000000000001",
    ...overrides,
  };
}

function offering(overrides: Record<string, unknown> = {}) {
  return {
    id: "cblock00000000000000000001",
    title: "Requestable ice",
    startsAt: baseCandidate.startsAt,
    endsAt: baseCandidate.endsAt,
    surfaceId: baseCandidate.surfaceId,
    segmentId: baseCandidate.segmentId,
    recurrenceRule: null,
    recurrenceEndDate: null,
    venue: { timezone: "America/New_York" },
    ...overrides,
  };
}

function tx() {
  return {
    venueReservation: { findMany: vi.fn().mockResolvedValue([]) },
    segmentCoexistence: { findMany: vi.fn().mockResolvedValue([]) },
    venueScheduleBlock: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as Prisma.TransactionClient;
}

describe("venue reservation availability", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses strict half-open interval overlap and active occupancy statuses", async () => {
    const client = tx();
    await findVenueReservationConflicts(client, baseCandidate);

    expect(client.venueReservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          venueId: baseCandidate.venueId,
          startsAt: { lt: baseCandidate.endsAt },
          endsAt: { gt: baseCandidate.startsAt },
          status: { in: ["HELD", "CONFIRMED", "COMPLETED"] },
        }),
      }),
    );
  });

  it("does not conflict across surfaces", async () => {
    const client = tx();
    vi.mocked(client.venueReservation.findMany).mockResolvedValue([
      reservation({ surfaceId: "cothersurface0000000000001" }),
    ] as never);

    await expect(findVenueReservationConflicts(client, baseCandidate)).resolves.toEqual([]);
  });

  it("allows declared coexistence between distinct segments", async () => {
    const client = tx();
    vi.mocked(client.venueReservation.findMany).mockResolvedValue([
      reservation({ segmentId: "csegment000000000000000002" }),
    ] as never);
    vi.mocked(client.segmentCoexistence.findMany).mockResolvedValue([
      {
        segmentAId: baseCandidate.segmentId,
        segmentBId: "csegment000000000000000002",
      },
    ] as never);

    await expect(findVenueReservationConflicts(client, baseCandidate)).resolves.toEqual([]);
  });

  it("treats whole-surface reservations as conflicts for every segment", async () => {
    const client = tx();
    vi.mocked(client.venueReservation.findMany).mockResolvedValue([
      reservation({ segmentId: null }),
    ] as never);

    await expect(findVenueReservationConflicts(client, baseCandidate)).resolves.toHaveLength(1);
  });

  it("treats venue-wide claims as conflicts for every surface and segment", async () => {
    const client = tx();
    vi.mocked(client.venueReservation.findMany).mockResolvedValue([
      reservation({ surfaceId: null, segmentId: null }),
    ] as never);

    await expect(findVenueReservationConflicts(client, baseCandidate)).resolves.toHaveLength(1);
  });

  it("keeps offerings separate from occupancy", async () => {
    const client = tx();
    vi.mocked(client.venueScheduleBlock.findMany).mockResolvedValue([offering()] as never);

    const result = await findVenueReservationAvailability(client, {
      ...baseCandidate,
      includeOfferings: true,
    });

    expect(result.offerings).toHaveLength(1);
    expect(result.occupancy).toEqual([]);
    expect(client.venueScheduleBlock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ intent: "OFFERING", status: "PUBLISHED" }),
      }),
    );
  });

  it("expands a recurring offering to a later occurrence in the requested window", async () => {
    const client = tx();
    vi.mocked(client.venueScheduleBlock.findMany).mockResolvedValue([
      offering({
        recurrenceRule: "FREQ=WEEKLY;COUNT=4",
        recurrenceEndDate: new Date("2026-09-22T18:00:00.000Z"),
      }),
    ] as never);

    const startsAt = new Date("2026-09-15T18:00:00.000Z");
    const endsAt = new Date("2026-09-15T19:00:00.000Z");
    const result = await findVenueReservationAvailability(client, {
      ...baseCandidate,
      startsAt,
      endsAt,
      includeOfferings: true,
    });

    expect(result.offerings).toEqual([
      expect.objectContaining({ startsAt, endsAt }),
    ]);
    expect(client.venueScheduleBlock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startsAt: { lt: endsAt },
          AND: [
            {
              OR: [
                {
                  recurrenceRule: null,
                  endsAt: { gt: startsAt },
                },
                { recurrenceRule: { not: null } },
              ],
            },
          ],
        }),
      }),
    );
  });

  it("returns only recurring offering occurrences that overlap the requested window", async () => {
    const client = tx();
    vi.mocked(client.venueScheduleBlock.findMany).mockResolvedValue([
      offering({
        recurrenceRule: "FREQ=WEEKLY;COUNT=4",
        recurrenceEndDate: new Date("2026-09-22T18:00:00.000Z"),
      }),
    ] as never);

    const result = await findVenueReservationAvailability(client, {
      ...baseCandidate,
      startsAt: new Date("2026-09-08T18:30:00.000Z"),
      endsAt: new Date("2026-09-15T18:00:00.000Z"),
      includeOfferings: true,
    });

    expect(result.offerings).toEqual([
      expect.objectContaining({
        startsAt: new Date("2026-09-08T18:00:00.000Z"),
        endsAt: new Date("2026-09-08T19:00:00.000Z"),
      }),
    ]);
  });

  it.each([
    ["COUNT", "FREQ=WEEKLY;COUNT=2", new Date("2026-09-22T18:00:00.000Z")],
    ["end date", "FREQ=WEEKLY;COUNT=4", new Date("2026-09-08T18:00:00.000Z")],
  ])("does not expand recurring offerings beyond their finite %s bound", async (
    _bound,
    recurrenceRule,
    recurrenceEndDate,
  ) => {
    const client = tx();
    vi.mocked(client.venueScheduleBlock.findMany).mockResolvedValue([
      offering({
        recurrenceRule,
        recurrenceEndDate,
      }),
    ] as never);

    const result = await findVenueReservationAvailability(client, {
      ...baseCandidate,
      startsAt: new Date("2026-09-15T18:00:00.000Z"),
      endsAt: new Date("2026-09-15T19:00:00.000Z"),
      includeOfferings: true,
    });

    expect(result.offerings).toEqual([]);
  });

  it("never reports recurring offering occurrences as occupancy or conflicts", async () => {
    const client = tx();
    vi.mocked(client.venueScheduleBlock.findMany).mockResolvedValue([
      offering({
        recurrenceRule: "FREQ=WEEKLY;COUNT=2",
        recurrenceEndDate: new Date("2026-09-08T18:00:00.000Z"),
      }),
    ] as never);

    const result = await findVenueReservationAvailability(client, {
      ...baseCandidate,
      startsAt: new Date("2026-09-08T18:00:00.000Z"),
      endsAt: new Date("2026-09-08T19:00:00.000Z"),
      includeOfferings: true,
    });

    expect(result.offerings).toHaveLength(1);
    expect(result.occupancy).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it("expands recurring offerings at the venue wall-clock across New York DST", async () => {
    const client = tx();
    vi.mocked(client.venueScheduleBlock.findMany).mockResolvedValue([
      offering({
        startsAt: new Date("2026-03-01T15:00:00.000Z"),
        endsAt: new Date("2026-03-01T16:00:00.000Z"),
        recurrenceRule: "FREQ=WEEKLY;COUNT=3",
        recurrenceEndDate: null,
      }),
    ] as never);

    const result = await findVenueReservationAvailability(client, {
      ...baseCandidate,
      startsAt: new Date("2026-03-08T14:00:00.000Z"),
      endsAt: new Date("2026-03-08T15:00:00.000Z"),
      includeOfferings: true,
    });

    expect(result.offerings).toEqual([
      expect.objectContaining({
        startsAt: new Date("2026-03-08T14:00:00.000Z"),
        endsAt: new Date("2026-03-08T15:00:00.000Z"),
      }),
    ]);
  });

  it("redacts owner and request identity from public conflicts", async () => {
    const client = tx();
    vi.mocked(client.venueReservation.findMany).mockResolvedValue([reservation()] as never);

    const [conflict] = await findVenueReservationConflicts(client, {
      ...baseCandidate,
      publicView: true,
    });

    expect(conflict).not.toHaveProperty("ownerLeagueId");
    expect(conflict).not.toHaveProperty("ownerTeamId");
    expect(conflict).not.toHaveProperty("ownerVenueOrganizationId");
    expect(conflict).not.toHaveProperty("sourceRequestId");
  });
});
