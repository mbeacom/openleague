// Server-only compatibility adapter for the unified calendar. The canonical
// schedule reader lives in lib/data/schedule-items.ts; this module preserves
// the CalendarItem contract consumed by existing calendar components.
import { addDays, differenceInCalendarDays } from "date-fns";

import { getViewableTeamIds, requireUserId } from "@/lib/auth/session";
import { getViewerMemberships } from "@/lib/data/dashboard";
import {
  deduplicateAssociationScheduleItems,
  getLeagueScheduleItems,
  getScheduleItems,
  getUserVenueIds,
} from "@/lib/data/schedule-items";
import type { AssociationScheduleItemView } from "@/types/association-operations";
import type { CalendarItem } from "@/types/events";

export type { CalendarItem, CalendarItemScope, CalendarSource } from "@/types/events";

const MAX_WINDOW_DAYS = 550;

export type CalendarWindow = {
  from: Date | string;
  to: Date | string;
};

function normalizeWindow(window: CalendarWindow): { from: Date; to: Date } {
  const from = new Date(window.from);
  const to = new Date(window.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error("Invalid calendar window: from/to must be valid dates");
  }
  if (to <= from) throw new Error("Invalid calendar window: to must be after from");
  return differenceInCalendarDays(to, from) > MAX_WINDOW_DAYS
    ? { from, to: addDays(from, MAX_WINDOW_DAYS) }
    : { from, to };
}

/**
 * Return the signed-in user's team, league, and venue schedule. Memberships
 * are resolved before the canonical reader is called so the reader never
 * broadens a team/venue resource to an entire tenant.
 */
export async function getUserCalendarItems(
  window: CalendarWindow,
): Promise<CalendarItem[]> {
  const userId = await requireUserId();
  const { from, to } = normalizeWindow(window);
  const { teams, leagues } = await getViewerMemberships(userId);
  const teamIds = teams.map((membership) => membership.team.id);
  const viewableTeamIds = await getViewableTeamIds(userId);
  const venueIds = await getUserVenueIds(userId);

  const items = (
    await Promise.all([
      getScheduleItems({
        from,
        to,
        userId,
        teamIds,
        eventTeamIds: [...new Set([...teamIds, ...viewableTeamIds])],
        venueIds,
        leagueViewerRole: "MEMBER",
      }),
      ...leagues.map((membership) =>
        getLeagueScheduleItems(membership.league.id, {
          from,
          to,
          userId,
          leagueRole:
            membership.role === "LEAGUE_ADMIN"
              ? "LEAGUE_ADMIN"
              : membership.role === "TEAM_ADMIN"
                ? "TEAM_ADMIN"
                : "MEMBER",
        }),
      ),
    ])
  ).flat();

  return deduplicateAssociationScheduleItems(items).map(toCalendarItem);
}

/**
 * Kept as a named export for existing callers/tests. Deduplication itself is
 * owned by the canonical schedule reader.
 */
export function deduplicateCalendarItems(items: CalendarItem[]): CalendarItem[] {
  const canonical = items.map((item) => fromCalendarItem(item));
  return deduplicateAssociationScheduleItems(canonical).map(toCalendarItem);
}

function toCalendarItem(item: AssociationScheduleItemView): CalendarItem {
  const source: CalendarItem["source"] =
    item.source === "practice"
      ? "practice"
      : item.source === "event"
        ? "event"
        : item.source === "venueReservation"
          ? "venue-block"
          : "signup";

  return {
    id: item.id,
    source,
    title: item.title,
    startAt: item.startsAt.toISOString(),
    endAt: item.endsAt?.toISOString() ?? null,
    timezone: item.timezone,
    scope: {
      ...(item.teamId && item.teamName
        ? { teamId: item.teamId, teamName: item.teamName }
        : {}),
      ...(item.leagueId && item.leagueName
        ? { leagueId: item.leagueId, leagueName: item.leagueName }
        : {}),
      ...(item.venueId
        ? { venueId: item.venueId, ...(item.venueName ? { venueName: item.venueName } : {}) }
        : {}),
    },
    href: item.href ?? "",
    eventType: item.eventType ?? item.source,
    venueReservationId: item.venueReservationId,
  };
}

function fromCalendarItem(item: CalendarItem): AssociationScheduleItemView {
  const source =
    item.source === "practice"
      ? "practice"
      : item.source === "event"
        ? "event"
        : item.source === "venue-block"
          ? "venueReservation"
          : "signupEvent";
  const startsAt = new Date(item.startAt);
  return {
    id: item.id,
    canonicalScheduleId: "",
    venueReservationId: item.venueReservationId ?? null,
    source,
    sourceId: item.id,
    title: item.title,
    startsAt,
    endsAt: item.endAt ? new Date(item.endAt) : null,
    timezone: item.timezone ?? "America/New_York",
    venueId: item.scope.venueId ?? null,
    surfaceId: null,
    segmentId: null,
    href: item.href,
    eventType: item.eventType,
    teamId: item.scope.teamId ?? null,
    teamName: item.scope.teamName ?? null,
    leagueId: item.scope.leagueId ?? null,
    leagueName: item.scope.leagueName ?? null,
    venueName: item.scope.venueName ?? null,
  };
}
