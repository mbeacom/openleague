/**
 * The practice editor's booking options carry each segment's kind (2b): the
 * editor's "larger than the booked ice" warning reads it from the segments
 * list and from confirmed reservations. A dropped mapping would silently turn
 * the warning off, so both are pinned here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockGetAvailableVenues } = vi.hoisted(() => ({
    mockPrisma: {
        team: { findUnique: vi.fn() },
        practiceSession: { findFirst: vi.fn() },
        leagueUser: { findFirst: vi.fn() },
        venueReservation: { findMany: vi.fn() },
        iceSurface: { findMany: vi.fn() },
        surfaceSegment: { findMany: vi.fn() },
    },
    mockGetAvailableVenues: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireUserId: vi.fn().mockResolvedValue("cuserxxxxxxxxxxxxxxxxxxxx") }));
vi.mock("@/lib/actions/venues", () => ({ getAvailableVenues: mockGetAvailableVenues }));

import { getVenueBookingOptions } from "@/app/(dashboard)/practice-planner/venue-booking-options";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const VENUE = "cvenuexxxxxxxxxxxxxxxxxxx";
const SURFACE = "csurfacexxxxxxxxxxxxxxxxx";

beforeEach(() => {
    vi.clearAllMocks();
    mockGetAvailableVenues.mockResolvedValue([{ id: VENUE, name: "Test Rink", timezone: "America/New_York" }]);
    mockPrisma.team.findUnique.mockResolvedValue({ leagueId: null });
    mockPrisma.practiceSession.findFirst.mockResolvedValue(null);
    mockPrisma.iceSurface.findMany.mockResolvedValue([
        { id: SURFACE, name: "Main", venueId: VENUE, wholeLabel: "Full ice" },
    ]);
    mockPrisma.surfaceSegment.findMany.mockResolvedValue([
        { id: "cseghalfxxxxxxxxxxxxxxxxx", name: "Half A", surfaceId: SURFACE, kind: "HALF" },
        { id: "csegcrossxxxxxxxxxxxxxxxx", name: "Cross 1", surfaceId: SURFACE, kind: "CROSS" },
    ]);
    mockPrisma.venueReservation.findMany.mockResolvedValue([
        {
            id: "creshalfxxxxxxxxxxxxxxxxx",
            startsAt: new Date("2026-04-07T22:00:00.000Z"),
            endsAt: new Date("2026-04-07T23:00:00.000Z"),
            timezone: "America/New_York",
            venueId: VENUE,
            surfaceId: SURFACE,
            segmentId: "cseghalfxxxxxxxxxxxxxxxxx",
            ownerLeagueId: null,
            ownerTeamId: TEAM,
            venue: { name: "Test Rink" },
            surface: { name: "Main" },
            segment: { name: "Half A", kind: "HALF" },
        },
        {
            id: "creswholexxxxxxxxxxxxxxxx",
            startsAt: new Date("2026-04-08T22:00:00.000Z"),
            endsAt: new Date("2026-04-08T23:00:00.000Z"),
            timezone: "America/New_York",
            venueId: VENUE,
            surfaceId: SURFACE,
            segmentId: null,
            ownerLeagueId: null,
            ownerTeamId: TEAM,
            venue: { name: "Test Rink" },
            surface: { name: "Main" },
            segment: null,
        },
    ]);
});

describe("getVenueBookingOptions segment kind (2b)", () => {
    it("selects each segment's kind and carries it onto the segments list", async () => {
        const options = await getVenueBookingOptions(TEAM);

        expect(mockPrisma.surfaceSegment.findMany.mock.calls[0][0].select.kind).toBe(true);
        expect(options.segmentsBySurface[SURFACE]).toEqual([
            { id: "cseghalfxxxxxxxxxxxxxxxxx", name: "Half A", kind: "HALF" },
            { id: "csegcrossxxxxxxxxxxxxxxxx", name: "Cross 1", kind: "CROSS" },
        ]);
    });

    it("selects a reservation's segment kind and maps it, null for a whole-surface booking", async () => {
        const options = await getVenueBookingOptions(TEAM);

        expect(mockPrisma.venueReservation.findMany.mock.calls[0][0].select.segment).toEqual({
            select: { name: true, kind: true },
        });
        expect(options.reservations.map((reservation) => [reservation.id, reservation.segmentKind])).toEqual([
            ["creshalfxxxxxxxxxxxxxxxxx", "HALF"],
            ["creswholexxxxxxxxxxxxxxxx", null],
        ]);
    });
});
