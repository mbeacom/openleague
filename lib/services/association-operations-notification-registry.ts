import { z } from "zod";

import { validateCuid } from "@/lib/utils/sanitization";

export type AssociationOperationsNotificationPriority =
  | "LOW"
  | "NORMAL"
  | "HIGH"
  | "URGENT";

const identifier = z.string().refine(validateCuid, "Invalid identifier format");
const requestData = z.object({ requestId: identifier }).strict();
const reservationData = z
  .object({ venueReservationId: identifier })
  .strict();

type AssociationOperationsNotificationDefinition = {
  aggregateType: "VENUE_REQUEST" | "VENUE_RESERVATION";
  priority: AssociationOperationsNotificationPriority;
  data: z.ZodType;
  subject: string;
  content: string;
};

/**
 * Minimal foundational registry. Later association stories may add events, but
 * this worker-owned namespace remains disjoint from the ADR-0006 gear registry.
 */
export const ASSOCIATION_OPERATIONS_NOTIFICATION_REGISTRY = {
  "association.venue_request.submitted": {
    aggregateType: "VENUE_REQUEST",
    priority: "NORMAL",
    data: requestData,
    subject: "New venue request",
    content: "A venue request is waiting for review.",
  },
  "association.venue_request.approved": {
    aggregateType: "VENUE_REQUEST",
    priority: "NORMAL",
    data: requestData,
    subject: "Venue request approved",
    content: "A venue request was approved.",
  },
  "association.venue_request.partially_approved": {
    aggregateType: "VENUE_REQUEST",
    priority: "NORMAL",
    data: requestData,
    subject: "Venue request partially approved",
    content: "Part of a venue request was approved.",
  },
  "association.venue_request.declined": {
    aggregateType: "VENUE_REQUEST",
    priority: "NORMAL",
    data: requestData,
    subject: "Venue request declined",
    content: "A venue request was declined.",
  },
  "association.venue_reservation.confirmed": {
    aggregateType: "VENUE_RESERVATION",
    priority: "NORMAL",
    data: reservationData,
    subject: "Venue reservation confirmed",
    content: "A venue reservation was confirmed.",
  },
  "association.venue_reservation.assigned.practice": {
    aggregateType: "VENUE_RESERVATION",
    priority: "NORMAL",
    data: reservationData,
    subject: "Venue reservation assigned",
    content: "A venue reservation was assigned to a practice.",
  },
  "association.venue_reservation.released": {
    aggregateType: "VENUE_RESERVATION",
    priority: "HIGH",
    data: reservationData,
    subject: "Venue reservation released",
    content: "A venue reservation was released.",
  },
  "association.venue_reservation.canceled": {
    aggregateType: "VENUE_RESERVATION",
    priority: "HIGH",
    data: reservationData,
    subject: "Venue reservation canceled",
    content: "A venue reservation was canceled.",
  },
} as const satisfies Record<
  string,
  AssociationOperationsNotificationDefinition
>;

export type AssociationOperationsNotificationEventType =
  keyof typeof ASSOCIATION_OPERATIONS_NOTIFICATION_REGISTRY;

export const ASSOCIATION_OPERATIONS_NOTIFICATION_EVENT_TYPES = Object.keys(
  ASSOCIATION_OPERATIONS_NOTIFICATION_REGISTRY,
) as AssociationOperationsNotificationEventType[];

export function isAssociationOperationsNotificationEventType(
  value: string,
): value is AssociationOperationsNotificationEventType {
  return Object.hasOwn(ASSOCIATION_OPERATIONS_NOTIFICATION_REGISTRY, value);
}

export type AssociationOperationsNotificationEvent = {
  type: AssociationOperationsNotificationEventType;
  aggregateType: "VENUE_REQUEST" | "VENUE_RESERVATION";
  aggregateId: string;
  priority: AssociationOperationsNotificationPriority;
  subject: string;
  content: string;
  payload: z.infer<typeof requestData> | z.infer<typeof reservationData>;
};

export function parseAssociationOperationsNotificationEvent(input: {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
}):
  | { ok: true; event: AssociationOperationsNotificationEvent }
  | { ok: false; diagnostic: string } {
  if (!isAssociationOperationsNotificationEventType(input.eventType)) {
    return { ok: false, diagnostic: "unknown association event type" };
  }
  const definition = ASSOCIATION_OPERATIONS_NOTIFICATION_REGISTRY[input.eventType];
  if (definition.aggregateType !== input.aggregateType) {
    return { ok: false, diagnostic: "association event aggregate mismatch" };
  }
  if (!validateCuid(input.aggregateId)) {
    return { ok: false, diagnostic: "malformed association event aggregate identifier" };
  }

  const envelope = z.object({
    kind: z.enum(["VENUE_REQUEST", "VENUE_RESERVATION"]),
    data: definition.data,
  }).strict().safeParse(input.payload);
  if (!envelope.success || envelope.data.kind !== definition.aggregateType) {
    return { ok: false, diagnostic: "malformed association event payload" };
  }
  const payloadAggregateId =
    "requestId" in envelope.data.data
      ? envelope.data.data.requestId
      : envelope.data.data.venueReservationId;
  if (payloadAggregateId !== input.aggregateId) {
    return { ok: false, diagnostic: "association event identifier mismatch" };
  }

  return {
    ok: true,
    event: {
      type: input.eventType,
      aggregateType: definition.aggregateType,
      aggregateId: input.aggregateId,
      priority: definition.priority,
      subject: definition.subject,
      content: definition.content,
      payload: envelope.data.data,
    },
  };
}

export function assertAssociationOperationsNotificationEvent(input: {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
}): AssociationOperationsNotificationEvent {
  const result = parseAssociationOperationsNotificationEvent(input);
  if (!result.ok) throw new Error(result.diagnostic);
  return result.event;
}
