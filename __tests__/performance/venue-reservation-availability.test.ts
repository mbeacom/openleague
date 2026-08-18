/**
 * T018 (part 2): documented-scale performance for venue reservation conflict
 * detection, mirroring the existing SC-008 pattern in
 * `__tests__/lib/utils/availability.test.ts` (50 timed runs, p95 assertion)
 * but against `findVenueReservationConflicts` — the reservation-native
 * successor availability primitive introduced in this feature.
 */
import { describe, expect, it } from "vitest";

import { findVenueReservationConflicts } from "@/lib/services/venue-reservation-availability";

const VENUE_ID = "cvenue0000000000000000000";
const SURFACE_1 = "csurf10000000000000000000";
const SURFACE_2 = "csurf20000000000000000000";
const SEG_A = "cseg_a0000000000000000000";
const SEG_B = "cseg_b0000000000000000000";
const SEG_C = "cseg_c0000000000000000000";

type ReservationRow = {
  id: string;
  status: "HELD" | "CONFIRMED" | "COMPLETED";
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  venueId: string;
  surfaceId: string | null;
  segmentId: string | null;
  ownerLeagueId: string | null;
  ownerTeamId: string | null;
  ownerVenueOrganizationId: string | null;
  sourceRequestId: string | null;
};

describe("venue reservation availability performance (SC-008 analogue, T018 part 2)", () => {
  it("keeps p95 conflict-lookup latency under 500ms across 50 runs at 25,000 annual commitments", async () => {
    const hour = 3_600_000;
    const monthStart = Date.UTC(2026, 8, 1, 6);
    const segCycle: (string | null)[] = [SEG_A, SEG_B, SEG_C, null];

    const reservations: ReservationRow[] = [];
    for (let i = 0; i < 25_000; i++) {
      const startsAt = new Date(monthStart + (i % 30) * 24 * hour + (i % 12) * hour);
      const endsAt = new Date(startsAt.getTime() + hour);
      const surfaceId = i % 2 === 0 ? SURFACE_1 : SURFACE_2;
      const segmentId = surfaceId === SURFACE_1 ? segCycle[i % 4] : null;

      reservations.push({
        id: `perf-reservation-${i}`,
        status: i % 17 === 0 ? "HELD" : "CONFIRMED",
        startsAt,
        endsAt,
        timezone: "UTC",
        venueId: VENUE_ID,
        surfaceId,
        segmentId,
        ownerLeagueId: null,
        ownerTeamId: `team-${i % 25}`,
        ownerVenueOrganizationId: null,
        sourceRequestId: null,
      });
    }

    const tx = {
      venueReservation: {
        // Real Prisma applies the where-clause in the database; here the
        // fixture is returned unfiltered so the timed cost measures the
        // service's own JS-side scope/coexistence computation across the
        // full 1,000-row candidate set, exactly like the SC-008 precedent.
        findMany: async () =>
          reservations.map((row) => ({ ...row, heldUntil: row.status === "HELD" ? new Date(monthStart + 365 * 24 * hour) : null })),
      },
      segmentCoexistence: {
        findMany: async () => [],
      },
    } as any;

    // SEG_C conflicts with A/C rows (and venue-wide/whole-surface rows) while
    // coexisting with B (no coexistence pairs registered), exercising the
    // full scope/segment comparison across a wide same-day window.
    const candidate = {
      venueId: VENUE_ID,
      surfaceId: SURFACE_1,
      segmentId: SEG_C,
      startsAt: new Date(Date.UTC(2026, 8, 15, 6)),
      endsAt: new Date(Date.UTC(2026, 8, 15, 18)),
    };

    const durations: number[] = [];
    let lastResult: Awaited<ReturnType<typeof findVenueReservationConflicts>> = [];
    for (let run = 0; run < 50; run++) {
      const started = performance.now();
      lastResult = await findVenueReservationConflicts(tx, candidate);
      durations.push(performance.now() - started);
    }

    // The fixture must actually produce work: conflicts exist in the window.
    expect(lastResult.length).toBeGreaterThan(0);

    durations.sort((a, b) => a - b);
    const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
    expect(p95).toBeLessThanOrEqual(500);
  });
});
