import type { AssociationScheduleItemView } from "@/types/association-operations";

export type ScheduleIdentityInput = {
  venueReservationId?: string | null;
  source: AssociationScheduleItemView["source"];
  sourceId: string;
  startsAt: Date;
};

/**
 * Linked aliases use the reservation as their one stable schedule identity.
 * Unlinked legacy rows retain a source- and occurrence-qualified identity.
 */
export function canonicalScheduleIdentity(
  input: ScheduleIdentityInput,
): string {
  return input.venueReservationId
    ? `reservation:${input.venueReservationId}`
    : `${input.source}:${input.sourceId}:${input.startsAt.toISOString()}`;
}

const SOURCE_PRIORITY: Record<AssociationScheduleItemView["source"], number> = {
  venueReservation: 0,
  event: 1,
  signupEvent: 2,
  eventGame: 3,
  practice: 4,
  seasonGame: 5,
};

/**
 * Removes linked aliases without collapsing independent unlinked legacy rows.
 * A domain activity wins over the bare reservation and Event aliases so the
 * schedule keeps its most useful participant-facing title.
 */
export function deduplicateAssociationScheduleItems<
  T extends AssociationScheduleItemView,
>(items: readonly T[]): T[] {
  const chosen = new Map<string, T>();
  const participantEventHrefs = new Map<string, string>();
  for (const item of items) {
    const identity = canonicalScheduleIdentity({
      venueReservationId: item.venueReservationId,
      source: item.source,
      sourceId: item.sourceId,
      startsAt: item.startsAt,
    });
    if (item.venueReservationId && item.source === "event" && item.href) {
      const currentHref = participantEventHrefs.get(identity);
      if (!currentHref || item.href.localeCompare(currentHref) < 0) {
        participantEventHrefs.set(identity, item.href);
      }
    }
    const current = chosen.get(identity);
    if (
      !current
      || SOURCE_PRIORITY[item.source] > SOURCE_PRIORITY[current.source]
    ) {
      chosen.set(identity, { ...item, canonicalScheduleId: identity });
    }
  }
  return [...chosen.entries()].map(([identity, item]) => {
    const participantEventHref = participantEventHrefs.get(identity);
    return participantEventHref
      ? { ...item, href: participantEventHref }
      : item;
  }).sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime()
      || a.canonicalScheduleId.localeCompare(b.canonicalScheduleId),
  );
}
