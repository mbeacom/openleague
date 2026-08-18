import { prisma } from "@/lib/db/prisma";
import { expandRecurrenceWindow } from "@/lib/utils/venue-schedule";
import type { BookingConflict, VenueBookingView } from "@/types/segments";
import type { Prisma } from "@prisma/client";

/**
 * Unified venue availability engine (feature 006 + feature 007 dual-read).
 *
 * Canonical VenueReservation rows are authoritative. During the additive
 * cutover, unlinked legacy rows remain visible so rollback cannot hide an
 * existing commitment.
 *
 * 1. Different venues never conflict (all queries are venue-scoped).
 * 2. Venue-wide rows (calendar Events always; any row with `surfaceId: null`)
 *    conflict with everything at the venue.
 * 3. Same surface where either side is whole-surface (`segmentId: null`)
 *    conflicts.
 * 4. Same surface, both segment-scoped: conflict UNLESS a SegmentCoexistence
 *    row exists for the canonical pair. The same segment twice always
 *    conflicts (no self-coexistence rows).
 * 5. Different surfaces of the same venue never conflict.
 *
 * Time overlap is strict — `existing.start < candidate.end AND
 * existing.end > candidate.start` — so intervals that merely touch never
 * conflict. Events with no `endAt` are treated as point-in-time (mirroring
 * game-conflicts): they conflict when their startAt falls within
 * [candidate.startAt, candidate.endAt).
 *
 * Source inclusion filters: Events (all), SeasonGames (SCHEDULED/COMPLETED —
 * drafts and canceled games hold no ice), EventGames (parent SignupEvent
 * PUBLISHED and game not CANCELED), VenueScheduleBlocks (PUBLISHED; blocks
 * with a recurrenceRule are expanded per occurrence via
 * `expandRecurrenceWindow` and each overlapping occurrence is reported with
 * the occurrence's own times), PracticeSessions (attached: venueId + startAt
 * set; slot end = startAt + duration minutes).
 *
 * Results are warnings, not hard blocks: saving over a conflict requires an
 * explicit recorded override (conflictOverriddenBy/At on the booking row).
 */

export type AvailabilityCandidate = {
  venueId: string;
  surfaceId?: string | null;
  /** null/undefined with a surfaceId = whole surface (R2: no WHOLE rows). */
  segmentId?: string | null;
  startAt: Date;
  endAt: Date;
  excludeEventId?: string;
  excludeSeasonGameId?: string;
  excludeEventGameId?: string;
  excludeBlockId?: string;
  excludePracticeId?: string;
  excludeReservationIds?: readonly string[];
};

type AvailabilityClient = Prisma.TransactionClient;

type FetchParams = {
  venueId: string;
  windowStart: Date;
  windowEnd: Date;
  /** When set, queries pre-filter to this surface + venue-wide rows. */
  surfaceId?: string | null;
  excludeEventId?: string;
  excludeSeasonGameId?: string;
  excludeEventGameId?: string;
  excludeBlockId?: string;
  excludePracticeId?: string;
};

/**
 * Find existing bookings that conflict with a candidate slot at a venue.
 *
 * Applies the five-source, segment-aware semantics documented above; the
 * surface's coexistence pairs are loaded once per call. Results are sorted
 * by startAt ascending.
 */
export async function findBookingConflicts(
  candidate: AvailabilityCandidate,
  client: AvailabilityClient = prisma as unknown as AvailabilityClient,
): Promise<BookingConflict[]> {
  return findBookingConflictsFromSources(candidate, client, true);
}

/**
 * Reservation writers use this inside their serializable transaction while
 * canonical rows are checked by the reservation-native detector. Keeping the
 * legacy half separate avoids querying and reporting canonical reservations
 * twice while the dual-read rollout is active.
 */
export async function findUnlinkedLegacyBookingConflicts(
  candidate: AvailabilityCandidate,
  client: AvailabilityClient,
): Promise<BookingConflict[]> {
  return findBookingConflictsFromSources(candidate, client, false);
}

async function findBookingConflictsFromSources(
  candidate: AvailabilityCandidate,
  client: AvailabilityClient,
  includeReservations: boolean,
): Promise<BookingConflict[]> {
  const surfaceId = candidate.surfaceId ?? null;
  // A segment is only meaningful with a surface; without one the candidate
  // is venue-wide and conflicts with everything regardless.
  const segmentId = surfaceId ? candidate.segmentId ?? null : null;

  const params: FetchParams = {
    venueId: candidate.venueId,
    windowStart: candidate.startAt,
    windowEnd: candidate.endAt,
    surfaceId,
    excludeEventId: candidate.excludeEventId,
    excludeSeasonGameId: candidate.excludeSeasonGameId,
    excludeEventGameId: candidate.excludeEventGameId,
    excludeBlockId: candidate.excludeBlockId,
    excludePracticeId: candidate.excludePracticeId,
  };

  const [reservations, events, seasonGames, eventGames, scheduleBlocks, practices, coexistenceKeys] =
    await Promise.all([
      includeReservations
        ? fetchVenueReservations(client, params, candidate.excludeReservationIds)
        : Promise.resolve([]),
      fetchEvents(client, params),
      fetchSeasonGames(client, params),
      fetchEventGames(client, params),
      fetchScheduleBlocks(client, params),
      fetchPracticeSessions(client, params),
      // Coexistence only matters when both sides carry segments (rule 4);
      // whole-surface or venue-wide candidates conflict without consulting it.
      segmentId && surfaceId
        ? loadCoexistenceKeys(client, surfaceId)
        : Promise.resolve(new Set<string>()),
    ]);

  return [...reservations, ...events, ...seasonGames, ...eventGames, ...scheduleBlocks, ...practices]
    .filter((booking) => scopesConflict(surfaceId, segmentId, booking, coexistenceKeys))
    .map(toConflict)
    .sort(byStartAt);
}

/**
 * All bookings at a venue over [from, to) from the same five sources with the
 * same inclusion filters (recurrences expanded per occurrence), mapped to
 * VenueBookingView rows for the venue schedule board (FR-021).
 *
 * Recurring block occurrences share the block's id; consumers needing a
 * unique per-row key should combine id + startAt.
 */
export async function getVenueBookings(params: {
  venueId: string;
  from: Date;
  to: Date;
}): Promise<VenueBookingView[]> {
  const client = prisma as unknown as AvailabilityClient;
  const fetchParams: FetchParams = {
    venueId: params.venueId,
    windowStart: params.from,
    windowEnd: params.to,
  };

  const [reservations, events, seasonGames, eventGames, scheduleBlocks, practices] = await Promise.all([
    fetchVenueReservations(client, fetchParams),
    fetchEvents(client, fetchParams),
    fetchSeasonGames(client, fetchParams),
    fetchEventGames(client, fetchParams),
    fetchScheduleBlocks(client, fetchParams),
    fetchPracticeSessions(client, fetchParams),
  ]);

  return [...reservations, ...events, ...seasonGames, ...eventGames, ...scheduleBlocks, ...practices].sort(
    byStartAt
  );
}

// ---------------------------------------------------------------------------
// Segment math (rules 2-5). Pure — the sole source of conflict truth is the
// declared SegmentCoexistence rows, never geometry.
// ---------------------------------------------------------------------------

function scopesConflict(
  candidateSurfaceId: string | null,
  candidateSegmentId: string | null,
  existing: { surfaceId: string | null; segmentId: string | null },
  coexistenceKeys: Set<string>
): boolean {
  // Rule 2: either side venue-wide -> conflict.
  if (candidateSurfaceId === null || existing.surfaceId === null) return true;
  // Rule 5: different surfaces never conflict.
  if (candidateSurfaceId !== existing.surfaceId) return false;
  // Rule 3: same surface, either side whole-surface -> conflict.
  if (candidateSegmentId === null || existing.segmentId === null) return true;
  // Rule 4: same segment always conflicts; distinct segments conflict unless
  // a coexistence row exists for the canonical pair.
  if (candidateSegmentId === existing.segmentId) return true;
  return !coexistenceKeys.has(pairKey(candidateSegmentId, existing.segmentId));
}

/** Canonical (min, max) key so stored ordering never matters. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

async function loadCoexistenceKeys(
  client: AvailabilityClient,
  surfaceId: string,
): Promise<Set<string>> {
  // Both segments of a pair belong to the same surface (validation invariant),
  // so filtering on segmentA is sufficient.
  const pairs = await client.segmentCoexistence.findMany({
    where: { segmentA: { surfaceId } },
    select: { segmentAId: true, segmentBId: true },
  });
  return new Set(pairs.map((pair) => pairKey(pair.segmentAId, pair.segmentBId)));
}

// ---------------------------------------------------------------------------
// Source fetchers. Each returns VenueBookingView rows (id + conflict fields)
// already clipped to the window by the query (plus JS for computed practice
// ends and expanded block occurrences).
// ---------------------------------------------------------------------------

/** Candidate on a surface conflicts with same-surface + venue-wide rows only. */
function surfaceScopeFilter(surfaceId: string | null | undefined) {
  return surfaceId ? { OR: [{ surfaceId }, { surfaceId: null }] } : {};
}

async function fetchVenueReservations(
  client: AvailabilityClient,
  params: FetchParams,
  excludeReservationIds: readonly string[] = [],
): Promise<VenueBookingView[]> {
  const excludedLinkedSources = [
    params.excludeEventId
      ? { events: { some: { id: params.excludeEventId } } }
      : null,
    params.excludeSeasonGameId
      ? { seasonGames: { some: { id: params.excludeSeasonGameId } } }
      : null,
    params.excludeEventGameId
      ? { eventGames: { some: { id: params.excludeEventGameId } } }
      : null,
    params.excludePracticeId
      ? { practiceSessions: { some: { id: params.excludePracticeId } } }
      : null,
    params.excludeBlockId
      ? { sourceScheduleBlockId: params.excludeBlockId }
      : null,
  ].filter((filter): filter is NonNullable<typeof filter> => filter !== null);
  const reservations = await client.venueReservation.findMany({
    where: {
      venueId: params.venueId,
      ...(excludeReservationIds.length
        ? { id: { notIn: [...excludeReservationIds] } }
        : {}),
      status: { in: ["HELD", "CONFIRMED", "COMPLETED"] },
      startsAt: { lt: params.windowEnd },
      endsAt: { gt: params.windowStart },
      ...surfaceScopeFilter(params.surfaceId),
      ...(excludedLinkedSources.length > 0
        ? { NOT: excludedLinkedSources }
        : {}),
      AND: [
        {
          OR: [
            { status: { not: "HELD" } },
            { heldUntil: { gt: new Date() } },
          ],
        },
      ],
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      surfaceId: true,
      segmentId: true,
      segment: { select: { name: true } },
    },
  });

  return reservations.map((reservation) => ({
    id: reservation.id,
    source: "venueReservation" as const,
    title: "Reserved venue time",
    startAt: reservation.startsAt,
    endAt: reservation.endsAt,
    surfaceId: reservation.surfaceId,
    segmentId: reservation.segmentId,
    segmentName: reservation.segment?.name ?? null,
  }));
}

async function fetchEvents(
  client: AvailabilityClient,
  params: FetchParams,
): Promise<VenueBookingView[]> {
  const events = await client.event.findMany({
    where: {
      venueId: params.venueId,
      venueReservationId: null,
      ...(params.excludeEventId ? { id: { not: params.excludeEventId } } : {}),
      // Overlap: existing start before window end AND existing end after
      // window start; endAt-less events are point-in-time within the window.
      AND: [
        {
          OR: [
            { endAt: { not: null }, startAt: { lt: params.windowEnd } },
            { endAt: null, startAt: { gte: params.windowStart, lt: params.windowEnd } },
          ],
        },
        {
          OR: [
            { endAt: { gt: params.windowStart } },
            { endAt: null, startAt: { gte: params.windowStart } },
          ],
        },
      ],
    },
    select: { id: true, title: true, startAt: true, endAt: true },
  });

  // Calendar Events carry no surface: always venue-wide.
  return events.map((event) => ({
    id: event.id,
    source: "event" as const,
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt,
    surfaceId: null,
    segmentId: null,
    segmentName: null,
  }));
}

async function fetchSeasonGames(
  client: AvailabilityClient,
  params: FetchParams,
): Promise<VenueBookingView[]> {
  const games = await client.seasonGame.findMany({
    where: {
      venueId: params.venueId,
      venueReservationId: null,
      status: { in: ["SCHEDULED", "COMPLETED"] },
      ...(params.excludeSeasonGameId ? { id: { not: params.excludeSeasonGameId } } : {}),
      ...surfaceScopeFilter(params.surfaceId),
      startAt: { lt: params.windowEnd },
      endAt: { gt: params.windowStart },
    },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      surfaceId: true,
      segmentId: true,
      segment: { select: { name: true } },
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  return games.map((game) => ({
    id: game.id,
    source: "seasonGame" as const,
    title: `${game.homeTeam.name} vs ${game.awayTeam.name}`,
    startAt: game.startAt,
    endAt: game.endAt,
    surfaceId: game.surfaceId,
    segmentId: game.segmentId,
    segmentName: game.segment?.name ?? null,
  }));
}

async function fetchEventGames(
  client: AvailabilityClient,
  params: FetchParams,
): Promise<VenueBookingView[]> {
  const games = await client.eventGame.findMany({
    where: {
      status: { not: "CANCELED" },
      venueReservationId: null,
      // EventGame has no venueId of its own; scope + publish state come from
      // the parent SignupEvent.
      event: { venueId: params.venueId, status: "PUBLISHED" },
      ...(params.excludeEventGameId ? { id: { not: params.excludeEventGameId } } : {}),
      ...surfaceScopeFilter(params.surfaceId),
      startAt: { lt: params.windowEnd },
      endAt: { gt: params.windowStart },
    },
    select: {
      id: true,
      name: true,
      startAt: true,
      endAt: true,
      surfaceId: true,
      segmentId: true,
      segment: { select: { name: true } },
      event: { select: { title: true } },
    },
  });

  return games.map((game) => ({
    id: game.id,
    source: "eventGame" as const,
    title: `${game.name ?? "Game"} — ${game.event.title}`,
    startAt: game.startAt,
    endAt: game.endAt,
    surfaceId: game.surfaceId,
    segmentId: game.segmentId,
    segmentName: game.segment?.name ?? null,
  }));
}

async function fetchScheduleBlocks(
  client: AvailabilityClient,
  params: FetchParams,
): Promise<VenueBookingView[]> {
  const blocks = await client.venueScheduleBlock.findMany({
    where: {
      venueId: params.venueId,
      status: "PUBLISHED",
      intent: { in: ["VENUE_ACTIVITY", "CLOSURE"] },
      ...(params.excludeBlockId ? { id: { not: params.excludeBlockId } } : {}),
      ...surfaceScopeFilter(params.surfaceId),
      // Occurrences never start before the base startsAt, so this prunes
      // recurring and non-recurring rows alike.
      startsAt: { lt: params.windowEnd },
      AND: [
        {
          OR: [
            // Non-recurring: standard strict overlap completes in the query.
            { recurrenceRule: null, endsAt: { gt: params.windowStart } },
            // Recurring: fetch and expand occurrences in JS.
            { recurrenceRule: { not: null } },
          ],
        },
      ],
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      surfaceId: true,
      segmentId: true,
      segment: { select: { name: true } },
      recurrenceRule: true,
      recurrenceEndDate: true,
      venue: { select: { timezone: true } },
      // Include every lifecycle status: even a released/canceled canonical
      // reservation remains authoritative for its linked occurrence.
      reservationOccurrences: { select: { startsAt: true } },
    },
  });

  const views: VenueBookingView[] = [];
  for (const block of blocks) {
    const linkedOccurrenceStarts = new Set(
      block.reservationOccurrences.map((reservation) => reservation.startsAt.getTime()),
    );
    const base = {
      id: block.id,
      source: "scheduleBlock" as const,
      title: block.title,
      surfaceId: block.surfaceId,
      segmentId: block.segmentId,
      segmentName: block.segment?.name ?? null,
    };

    if (block.recurrenceRule) {
      // expandRecurrenceWindow only emits occurrences that strictly overlap
      // the window; each is reported with the occurrence's own times.
      const occurrences = expandRecurrenceWindow(
        {
          startAt: block.startsAt,
          endAt: block.endsAt,
          recurrenceRule: block.recurrenceRule,
          recurrenceEndAt: block.recurrenceEndDate,
          timezone: block.venue.timezone,
        },
        params.windowStart,
        params.windowEnd
      );
      for (const occurrence of occurrences) {
        if (linkedOccurrenceStarts.has(occurrence.startAt.getTime())) continue;
        views.push({ ...base, startAt: occurrence.startAt, endAt: occurrence.endAt });
      }
    } else {
      if (linkedOccurrenceStarts.has(block.startsAt.getTime())) continue;
      views.push({ ...base, startAt: block.startsAt, endAt: block.endsAt });
    }
  }
  return views;
}

async function fetchPracticeSessions(
  client: AvailabilityClient,
  params: FetchParams,
): Promise<VenueBookingView[]> {
  const practices = await client.practiceSession.findMany({
    where: {
      // Unattached practices (no venue) have no availability footprint;
      // startAt is required whenever venueId is set (application invariant),
      // but guard against legacy rows by requiring it here too.
      venueId: params.venueId,
      venueReservationId: null,
      startAt: { not: null, lt: params.windowEnd },
      ...(params.excludePracticeId ? { id: { not: params.excludePracticeId } } : {}),
      ...surfaceScopeFilter(params.surfaceId),
    },
    select: {
      id: true,
      title: true,
      startAt: true,
      duration: true,
      surfaceId: true,
      segmentId: true,
      segment: { select: { name: true } },
    },
  });

  const views: VenueBookingView[] = [];
  for (const practice of practices) {
    if (!practice.startAt) continue; // narrows the nullable column; query already excludes
    // Slot end is computed (startAt + duration minutes), so the lower overlap
    // bound cannot live in the query; enforce strict overlap here.
    const endAt = new Date(practice.startAt.getTime() + practice.duration * 60_000);
    if (endAt <= params.windowStart) continue;
    views.push({
      id: practice.id,
      source: "practice" as const,
      title: `Practice — ${practice.title}`,
      startAt: practice.startAt,
      endAt,
      surfaceId: practice.surfaceId,
      segmentId: practice.segmentId,
      segmentName: practice.segment?.name ?? null,
    });
  }
  return views;
}

// ---------------------------------------------------------------------------
// Shaping
// ---------------------------------------------------------------------------

function toConflict(booking: VenueBookingView): BookingConflict {
  return {
    source: booking.source,
    title: booking.title,
    startAt: booking.startAt,
    endAt: booking.endAt,
    surfaceId: booking.surfaceId,
    segmentId: booking.segmentId,
    segmentName: booking.segmentName,
  };
}

function byStartAt(a: { startAt: Date }, b: { startAt: Date }): number {
  return a.startAt.getTime() - b.startAt.getTime();
}
